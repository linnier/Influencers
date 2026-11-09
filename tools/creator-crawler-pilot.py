#!/usr/bin/env python3
"""Small, read-only public-page pilot. Python stdlib only; never imports application code."""
import argparse
import csv
import datetime as dt
import html
import json
import math
import os
from pathlib import Path
import re
import resource
import signal
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

AGENT = 'iteaDiscoveryPilot/1.0'
HOSTS = frozenset(['instagram.com', 'www.instagram.com', 'tiktok.com', 'www.tiktok.com',
    'danielfooddiary.com', 'www.danielfooddiary.com', 'sophieong.com', 'www.sophieong.com',
    'collabstr.com', 'www.collabstr.com', 'www.bing.com', 'bing.com', 'cn.bing.com'])
TARGETS = [
    ('DanielFoodDiary — Instagram资料卡', 'https://www.instagram.com/danielfooddiary/'),
    ('DanielFoodDiary — TikTok资料卡', 'https://www.tiktok.com/@danielfooddiary'),
]
LIMIT_SECONDS, LIMIT_REQUESTS, LIMIT_BYTES = 90, 14, 8 * 1024 * 1024
PAGE_BYTES = 2 * 1024 * 1024
ROBOTS_BYTES = 512 * 1024


class PilotStop(Exception):
    pass


def safe_url(value):
    u = urllib.parse.urlsplit(value)
    if (u.scheme != 'https' or u.hostname not in HOSTS or u.username or u.password
            or u.port not in (None, 443) or len(value) > 1500):
        raise ValueError('网址或重定向不在本次公开测试范围内')
    return urllib.parse.urlunsplit((u.scheme, u.netloc, u.path or '/', u.query, ''))


def profile_url(value):
    try:
        u = urllib.parse.urlsplit(safe_url(value))
    except (ValueError, TypeError):
        return None
    parts = [p for p in u.path.split('/') if p]
    if u.hostname in ('instagram.com', 'www.instagram.com') and len(parts) == 1:
        handle = parts[0].lower()
        if handle not in ('p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'about') and re.fullmatch(r'[a-z0-9_.]{1,80}', handle):
            return ('Instagram', handle, 'https://www.instagram.com/' + handle + '/')
    if u.hostname in ('tiktok.com', 'www.tiktok.com') and len(parts) == 1:
        handle = parts[0].lstrip('@').lower()
        if parts[0].startswith('@') and re.fullmatch(r'[a-z0-9_.]{1,80}', handle):
            return ('TikTok', handle, 'https://www.tiktok.com/@' + handle)
    return None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Client:
    real_network = True

    def __init__(self):
        self.start = time.monotonic()
        self.deadline = self.start + LIMIT_SECONDS
        self.requests = 0
        self.download_bytes = 0
        self.last_request = 0
        self.gap_by_host = {}
        self.opener = urllib.request.build_opener(NoRedirect())

    def get(self, url, max_bytes=PAGE_BYTES):
        url = safe_url(url)
        for hop in range(3):
            remaining = self.deadline - time.monotonic()
            if remaining <= 0 or self.requests >= LIMIT_REQUESTS or self.download_bytes >= LIMIT_BYTES:
                raise PilotStop('达到本次时间、请求数或下载量上限，已停止')
            gap = max(0.8, self.gap_by_host.get(urllib.parse.urlsplit(url).hostname, 0))
            pause = max(0, gap - (time.monotonic() - self.last_request))
            if pause:
                time.sleep(min(pause, remaining))
            timeout = min(8, max(0.1, self.deadline - time.monotonic()))
            self.requests += 1
            self.last_request = time.monotonic()
            request = urllib.request.Request(url, headers={
                'User-Agent': AGENT, 'Accept': 'text/html,text/plain,application/rss+xml,application/xml;q=0.8',
                'Accept-Encoding': 'identity', 'Connection': 'close'})
            try:
                response = self.opener.open(request, timeout=timeout)
            except urllib.error.HTTPError as e:
                response = e
            with response:
                code = response.code
                if code in (301, 302, 303, 307, 308):
                    if hop == 2:
                        raise ValueError('重定向次数过多')
                    url = safe_url(urllib.parse.urljoin(url, response.headers.get('Location', '')))
                    continue
                limit = min(max_bytes, LIMIT_BYTES - self.download_bytes)
                body = response.read(limit + 1)
                self.download_bytes += len(body)
                if len(body) > limit:
                    raise ValueError('响应超过本次读取上限，已停止读取该页面')
                encoding = response.headers.get('Content-Encoding', '').lower()
                if encoding not in ('', 'identity'):
                    raise ValueError('页面返回压缩内容，本次轻量测试未解析')
                charset = response.headers.get_content_charset() or 'utf-8'
                try:
                    text = body.decode(charset, errors='replace')
                except LookupError:
                    text = body.decode('utf-8', errors='replace')
                return {'status': code, 'url': url, 'text': text,
                        'content_type': response.headers.get('Content-Type', ''), 'bytes': len(body)}
        raise ValueError('未完成页面读取')


def robots_document(source, content_type):
    """Recognize actual robots text; a MIME label alone is not a path decision."""
    body = source.lstrip('\ufeff')
    lines = [line.split('#', 1)[0].strip() for line in body.splitlines()]
    lines = [line for line in lines if line]
    meaningful = '\n'.join(lines)
    if re.search(r'<(?:!doctype|html|head|body|title|script|meta|iframe|div|form)\b', meaningful, re.I):
        match = re.search(r'<title\b[^>]*>(.{0,500}?)</title>', body, re.I | re.S)
        title = html.unescape(re.sub(r'<[^>]+>', '', match.group(1))).strip()[:120] if match else ''
        return {'kind': 'html', 'reason': '返回的是HTML网页，不是robots规则文本' + ('；页面标题：' + title if title else ''), 'title': title}
    if not lines:
        if 'text/plain' in content_type.lower():
            return {'kind': 'empty_rules', 'reason': '空的纯文本规则文件'}
        return {'kind': 'unknown', 'reason': '正文为空，且未标为纯文本规则文件'}
    records = []
    for line in lines:
        match = re.fullmatch(r'([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)', line)
        if not match:
            return {'kind': 'unknown', 'reason': '正文包含无法识别的规则行，未按允许采集处理'}
        records.append((match.group(1).lower(), match.group(2)))
    if not any(field == 'user-agent' and value for field, value in records):
        return {'kind': 'unknown', 'reason': '正文未包含有效的User-agent规则，无法确认'}
    return {'kind': 'rules', 'reason': '正文为可识别的robots规则文本', 'mime_mislabeled': 'text/html' in content_type.lower()}


def robots_policy(source, url):
    """Merge applicable groups; longest path rule wins, Allow wins ties."""
    groups, agents, rules, delay, directives = [], [], [], 0.0, False
    for line in source.splitlines():
        line = line.split('#', 1)[0].strip()
        if ':' not in line:
            continue
        field, value = [part.strip() for part in line.split(':', 1)]
        field = field.lower()
        if field == 'user-agent':
            if directives:
                groups.append((agents, rules, delay))
                agents, rules, delay, directives = [], [], 0.0, False
            if value:
                agents.append(value.split()[0].split('/')[0].lower())
        elif agents and field in ('allow', 'disallow', 'crawl-delay'):
            directives = True
            if field == 'crawl-delay':
                try:
                    number = float(value)
                    if math.isfinite(number) and number >= 0:
                        delay = max(delay, number)
                except ValueError:
                    pass
            elif value:
                rules.append((value, field == 'allow'))
    if agents:
        groups.append((agents, rules, delay))
    product = AGENT.split('/')[0].lower()
    selected = [group for group in groups if product in group[0]]
    if not selected:
        selected = [group for group in groups if '*' in group[0]]
    def normalized(value):
        def escape(match):
            character = chr(int(match.group()[1:], 16))
            return character if character.isascii() and (character.isalnum() or character in '-._~') else match.group().upper()
        value = re.sub(r'%[0-9A-Fa-f]{2}', escape, value)
        return urllib.parse.quote(value, safe="/%?:@!$&'()*+,;=-._~")
    parsed = urllib.parse.urlsplit(url)
    path = normalized((parsed.path or '/') + ('?' + parsed.query if parsed.query else ''))
    matches = []
    for _, group_rules, _ in selected:
        for rule, allowed in group_rules:
            rule = normalized(rule)
            terminal = rule.endswith('$')
            pattern = rule[:-1] if terminal else rule
            expression = '^' + re.escape(pattern).replace(r'\*', '.*') + ('$' if terminal else '')
            if re.search(expression, path):
                matches.append((len(pattern.replace('*', '').encode('utf-8')), allowed, rule))
    winner = max(matches, key=lambda match: (match[0], match[1])) if matches else None
    return {'allowed': winner[1] if winner else True, 'rule': winner[2] if winner else '',
            'crawl_delay': max((group[2] for group in selected), default=0.0)}


class Robots:
    def __init__(self, client):
        self.client, self.cache, self.checks = client, {}, []

    def allowed(self, url):
        u = urllib.parse.urlsplit(safe_url(url))
        root = u.scheme + '://' + u.netloc
        if root not in self.cache:
            try:
                response = self.client.get(root + '/robots.txt', ROBOTS_BYTES)
                self.checks.append({'url': root + '/robots.txt', 'http_status': response['status'],
                    'body_bytes': response.get('bytes', len(response['text'].encode('utf-8'))),
                    'content_type': response['content_type'], 'read_limit_bytes': ROBOTS_BYTES})
                code = response['status']
                if code in (404, 410):
                    self.cache[root] = (None, '')
                elif code == 200:
                    document = robots_document(response['text'], response['content_type'])
                    self.checks[-1]['document'] = document
                    self.checks[-1]['final_url'] = response['url']
                    if document['kind'] in ('rules', 'empty_rules'):
                        self.cache[root] = (response['text'].lstrip('\ufeff'), '')
                    else:
                        self.cache[root] = (None, 'robots.txt 未能确认，本次跳过：' + document['reason'])
                else:
                    self.cache[root] = (None, 'robots.txt 未能确认（HTTP %s），本次跳过' % code)
            except PilotStop:
                raise
            except Exception as e:
                self.checks.append({'url': root + '/robots.txt', 'http_status': None, 'read_limit_bytes': ROBOTS_BYTES, 'reason': error_text(e)})
                self.cache[root] = (None, 'robots.txt 未能确认，本次跳过：' + error_text(e))
        source, reason = self.cache[root]
        if reason:
            return False, reason
        decision = robots_policy(source, url) if source is not None else {'allowed': True, 'rule': '', 'crawl_delay': 0.0}
        self.checks.append({'target': url, 'allowed': decision['allowed'], 'matched_rule': decision['rule'], 'crawl_delay': decision['crawl_delay']})
        if not decision['allowed']:
            return False, '网站 robots.txt 不允许本采集程序读取该路径，本次跳过；匹配规则：' + decision['rule'][:160]
        if decision['crawl_delay'] > max(0, getattr(self.client, 'deadline', time.monotonic() + LIMIT_SECONDS) - time.monotonic()):
            return False, '网站要求的采集间隔超过本次剩余时间，本次跳过'
        if not hasattr(self.client, 'gap_by_host'):
            self.client.gap_by_host = {}
        self.client.gap_by_host[u.hostname] = decision['crawl_delay']
        return True, ''


def error_text(error):
    text = str(getattr(error, 'reason', error))
    text = re.sub(r'(https?://)[^/@\s]+@', r'\1[redacted]@', text)
    return text[:220]


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta, self.visible, self.scripts, self.mailto, self.title = {}, [], [], [], []
        self.suppressed, self.script_depth, self.script_text, self.in_title = 0, 0, [], False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta':
            self.meta[attrs.get('property', attrs.get('name', ''))] = attrs.get('content', '')
        if tag == 'a' and attrs.get('href', '').lower().startswith('mailto:'):
            self.mailto.append(urllib.parse.unquote(attrs['href'][7:].split('?')[0]))
        if tag in ('script', 'style', 'svg', 'head', 'noscript', 'template'):
            self.suppressed += 1
        if tag == 'script':
            self.script_depth += 1
            self.script_text = []
        if tag == 'title':
            self.in_title = True

    def handle_endtag(self, tag):
        if tag == 'script' and self.script_depth:
            self.script_depth -= 1
            self.scripts.append(''.join(self.script_text))
            self.script_text = []
        if tag in ('script', 'style', 'svg', 'head', 'noscript', 'template'):
            self.suppressed = max(0, self.suppressed - 1)
        if tag == 'title':
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title.append(data)
        if self.script_depth:
            self.script_text.append(data)
        if not self.suppressed:
            self.visible.append(data)


def emails(text):
    matches = re.findall(r'(?<![A-Za-z0-9._%+-])([A-Za-z0-9._%+-]{1,64}\s*@\s*[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24})(?![A-Za-z])', text)
    return list(dict.fromkeys(re.sub(r'\s+', '', match) for match in matches))[:5]


def parse_page(source, url):
    page = Page()
    page.feed(source)
    account = profile_url(url)
    title = page.meta.get('og:title') or ''.join(page.title).strip()
    if re.search(r'\b(log\s?in|sign\s?in|access denied|just a moment|verify you are human)\b', title, re.I):
        raise ValueError('返回登录或验证页面，本次不继续采集')
    if not account:
        visible = re.sub(r'\s+', ' ', ' '.join(page.visible)).strip()
        if len(visible) < 40:
            raise ValueError('页面没有足够的可读正文，未当作采集成功')
        found = emails(visible + ' ' + ' '.join(page.mailto))
        excerpt = ''
        if found:
            match = re.search(re.escape(found[0]).replace('@', r'\s*@\s*'), visible, re.I)
            at = match.start() if match else 0
            excerpt = visible[max(0, at - 70):at + 350]
        return {'name': title[:100], 'platform': '', 'handle': '', 'followers': None,
                'emails': found, 'evidence': excerpt, 'source_type': '公开网站，联系方式待核实'}
    platform, handle, canonical = account
    result = {'name': '', 'bio': '', 'followers': None}
    visited = [0]

    def walk(obj, depth=0):
        if depth > 45 or visited[0] >= 20000:
            return
        visited[0] += 1
        if isinstance(obj, dict):
            info = obj.get('userInfo')
            if isinstance(info, dict) and isinstance(info.get('user'), dict):
                user, stats = info['user'], info.get('stats') or {}
                if str(user.get('uniqueId', '')).lower() == handle:
                    result.update(name=str(user.get('nickname') or handle), bio=str(user.get('signature') or ''))
                    count = stats.get('followerCount') if isinstance(stats, dict) else None
                    if type(count) is int and count >= 0:
                        result['followers'] = count
            if str(obj.get('username', '')).lower() == handle and ('biography' in obj or 'full_name' in obj):
                result.update(name=str(obj.get('full_name') or handle), bio=str(obj.get('biography') or ''))
                stats = obj.get('edge_followed_by') or {}
                count = stats.get('count') if isinstance(stats, dict) else None
                count = obj.get('follower_count', count)
                if type(count) is int and count >= 0:
                    result['followers'] = count
            for value in obj.values():
                if isinstance(value, (dict, list)):
                    walk(value, depth + 1)
        elif isinstance(obj, list):
            for value in obj:
                if isinstance(value, (dict, list)):
                    walk(value, depth + 1)
    for script in page.scripts:
        try:
            walk(json.loads(script))
        except (ValueError, RecursionError):
            pass
    meta_bio = page.meta.get('og:description') or page.meta.get('description') or ''
    if not result['name'] and '@' + handle not in (title + ' ' + meta_bio).lower():
        raise ValueError('未返回与目标账号一致的公开资料，可能为登录页或受限页面')
    bio = result['bio'] or meta_bio
    name = result['name'] or title.split('(@')[0].strip() or handle
    return {'name': name[:100], 'platform': platform, 'handle': handle,
            'followers': result['followers'], 'emails': emails(bio),
            'evidence': bio[:450], 'source_type': '平台公开资料，联系方式待核实'}


def parse_feed(source):
    if '<!DOCTYPE' in source.upper() or '<!ENTITY' in source.upper():
        raise ValueError('搜索源返回不支持的 XML 声明')
    root = ET.fromstring(source)
    if root.tag.split('}')[-1] != 'rss':
        raise ValueError('搜索源没有返回可识别的 RSS，未当作0条结果')
    output, seen = [], set()
    for item in root.iter('item'):
        link = item.findtext('link') or ''
        account = profile_url(link)
        if account and account[2] not in seen:
            seen.add(account[2])
            output.append({'platform': account[0], 'handle': account[1], 'url': account[2],
                           'index_title': (item.findtext('title') or '')[:150],
                           'index_excerpt': html.unescape(item.findtext('description') or '')[:320]})
    return output[:10]


def memory_snapshot():
    values = {}
    try:
        for line in Path('/proc/meminfo').read_text().splitlines():
            name, rest = line.split(':', 1)
            if name in ('MemTotal', 'MemAvailable'):
                values[name + '_mib'] = round(int(rest.strip().split()[0]) / 1024, 1)
    except (OSError, ValueError):
        pass
    values['cpu_count'] = os.cpu_count()
    try:
        values['load_average'] = list(os.getloadavg())
    except OSError:
        pass
    return values


def checked_page(client, robots, label, url):
    started = time.monotonic()
    row = {'label': label, 'url': url, 'status': '未获取', 'http_status': None, 'emails': [], 'followers': None}
    try:
        allowed, reason = robots.allowed(url)
        if not allowed:
            row.update(status='跳过', reason=reason)
        else:
            response = client.get(url)
            row['http_status'] = response['status']
            if response['status'] != 200:
                row.update(reason='HTTP %s，可能为网站或网络出口限制；本次不重试' % response['status'])
            elif not any(t in response['content_type'].lower() for t in ('text/html', 'text/plain', 'application/xhtml')):
                row.update(reason='响应不是可读取的网页正文')
            else:
                data = parse_page(response['text'], url)
                row.update(data, status='已读取' if data['emails'] else '无邮箱跳过', final_url=response['url'])
                if not data['emails']:
                    row['reason'] = '主页资料卡已读取，没有公开邮箱，按规则跳过。'
    except PilotStop:
        raise
    except Exception as e:
        row.update(reason=error_text(e))
    row['seconds'] = round(time.monotonic() - started, 3)
    return row


def run_pilot(client=None, keyword='food', region='Singapore', output_root=None, targets=None, discover=False):
    client = client or Client()
    robots = Robots(client)
    started, usage = time.monotonic(), resource.getrusage(resource.RUSAGE_SELF)
    targets = list(TARGETS if targets is None else targets)
    report = {'test_mode': not client.real_network, 'started_at_singapore': dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(),
              'limits': {'seconds': LIMIT_SECONDS, 'requests': LIMIT_REQUESTS, 'download_body_bytes': LIMIT_BYTES, 'concurrency': 1, 'cpu_soft_seconds': 10, 'address_space_mib': 256},
              'host_before': memory_snapshot(), 'planned_target_count': len(targets), 'discovery': {}, 'pages': [],
              'application_changes': False, 'database_writes': False, 'paid_api_calls': False, 'search_api_keys_used': False}
    try:
        if not discover:
            report['discovery'] = {'status': '未执行', 'reason': '本次只读主页资料卡，未运行关键词发现', 'candidate_count': None}
        else:
            query = '(site:instagram.com OR site:tiktok.com) "%s" "%s"' % (keyword.replace('"', ' ')[:100], region.replace('"', ' ')[:60])
            feed_url = 'https://www.bing.com/search?' + urllib.parse.urlencode({'q': query, 'format': 'rss'})
            allowed, reason = robots.allowed(feed_url)
            if not allowed:
                report['discovery'] = {'status': '跳过', 'reason': reason, 'candidate_count': None}
            else:
                try:
                    response = client.get(feed_url, 512 * 1024)
                    if response['status'] != 200:
                        raise ValueError('搜索源返回 HTTP %s，不能确认为0条结果' % response['status'])
                    candidates = parse_feed(response['text'])
                    report['discovery'] = {'status': '已读取', 'source': 'Bing公开RSS（非保证可用的接口）',
                                           'query': query, 'candidate_count': len(candidates), 'candidates': candidates}
                    existing = {profile_url(url)[2] for _, url in targets if profile_url(url)}
                    targets.extend(('关键词候选 @' + c['handle'], c['url']) for c in candidates[:2] if c['url'] not in existing)
                except PilotStop:
                    raise
                except Exception as e:
                    report['discovery'] = {'status': '未获取', 'reason': error_text(e), 'candidate_count': None}
        report['planned_target_count'] = len(targets)
        for label, url in targets:
            try:
                row = checked_page(client, robots, label, url)
            except PilotStop as e:
                report['pages'].append({'label': label, 'url': url, 'status': '未完成', 'reason': str(e), 'http_status': None, 'emails': [], 'followers': None})
                raise
            report['pages'].append(row)
            print('[%s] %s | 邮箱 %s | 粉丝数 %s' % (row['status'], label,
                  ', '.join(row['emails']) or '未获取', row.get('followers') if row.get('followers') is not None else '未获取'), flush=True)
            if row.get('reason'):
                print('  原因：' + row['reason'], flush=True)
    except PilotStop as e:
        report['stop_reason'] = str(e)
    finally:
        current = resource.getrusage(resource.RUSAGE_SELF)
        wall = time.monotonic() - started
        cpu = (current.ru_utime + current.ru_stime) - (usage.ru_utime + usage.ru_stime)
        peak_mib = current.ru_maxrss / (1024 * 1024 if sys.platform == 'darwin' else 1024)
        report['robots_checks'] = robots.checks
        report['resources'] = {'elapsed_seconds': round(wall, 3), 'process_cpu_seconds': round(cpu, 3),
            'average_one_core_cpu_percent': round(cpu / wall * 100, 2) if wall else 0,
            'process_peak_rss_mib': round(peak_mib, 2), 'http_attempts': client.requests,
            'download_body_bytes': client.download_bytes, 'host_after': memory_snapshot()}
        output = Path(tempfile.mkdtemp(prefix='itea-crawler-pilot-', dir=output_root or '/tmp'))
        (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        with (output / 'public-contacts.csv').open('w', encoding='utf-8-sig', newline='') as stream:
            writer = csv.writer(stream)
            writer.writerow(['样本', '状态', '姓名', '平台', '账号', '粉丝数', '公开邮箱', '来源', '来源摘录', '未获取原因'])
            for row in report['pages']:
                values = [row['label'], row['status'], row.get('name', ''), row.get('platform', ''), row.get('handle', ''),
                    row.get('followers') if row.get('followers') is not None else '', '; '.join(row['emails']),
                    row.get('final_url', row['url']), row.get('evidence', ''), row.get('reason', '')]
                writer.writerow(["'" + str(v) if re.match(r'^\s*[=+@-]', str(v)) else v for v in values])
        print('\n' + ('【模拟网页测试，非真实采集】' if report['test_mode'] else '【真实网络试采；不写入达人库】'))
        discovery = report['discovery']
        discovery_detail = discovery.get('reason') or ('有效候选 %s 位' % discovery['candidate_count'] if discovery.get('candidate_count') is not None else '尚未取得可判断的结果')
        print('关键词发现：%s；%s' % (discovery.get('status', '未完成'), discovery_detail))
        print('保留有邮箱资料 %s / %s 个已执行样本；发现公开邮箱 %s 个（未验证投递有效性）' % (
            sum(r['status'] == '已读取' for r in report['pages']), len(report['pages']),
            len({email.lower() for r in report['pages'] for email in r['emails']})))
        print('无邮箱跳过 %s 个；读取失败/受限 %s 个' % (sum(r['status'] == '无邮箱跳过' for r in report['pages']), sum(r['status'] not in ('已读取', '无邮箱跳过') for r in report['pages'])))
        print('耗时 %.2f 秒 | 进程峰值内存 %.2f MiB | CPU时间 %.3f 秒 | HTTP尝试 %s 次 | 正文下载 %.2f KiB' % (
            wall, peak_mib, cpu, client.requests, client.download_bytes / 1024))
        for check in robots.checks:
            if 'target' in check:
                print('规则判断：%s | %s | 匹配规则 %s | 间隔 %s秒' % (check['target'], '允许' if check['allowed'] else '不允许', check['matched_rule'] or '无禁止规则', check['crawl_delay']))
                continue
            print('robots检查：%s | HTTP %s | 正文 %s KiB | 上限 %s KiB%s' % (check['url'],
                check.get('http_status') if check.get('http_status') is not None else '未确认',
                round(check['body_bytes'] / 1024, 2) if 'body_bytes' in check else '未完成',
                check['read_limit_bytes'] // 1024, (' | ' + check['reason']) if check.get('reason') else ''))
            if check.get('document'):
                print('  正文判断：' + check['document']['reason'])
            if check.get('final_url') and check['final_url'] != check['url']:
                print('  最终网址：' + check['final_url'])
        print('报告目录：' + str(output))
    return report, output


def main():
    parser = argparse.ArgumentParser(description='itea公开网页轻量试采：限时90秒、串行、只写/tmp报告、不访问应用数据库')
    parser.add_argument('--keyword', default='food')
    parser.add_argument('--region', default='Singapore')
    parser.add_argument('--keyword-probe', action='store_true', help='额外诊断公开关键词搜索源，默认不执行')
    parser.add_argument('--only-tiktok', action='store_true', help='仅复测1个TikTok主页，跳过搜索与其他网站')
    args = parser.parse_args()
    def deadline(signum, frame):
        raise PilotStop('达到本次时间或CPU用量上限，测试已停止')
    try:
        resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_CPU, (10, 15))
        signal.signal(signal.SIGXCPU, lambda signum, frame: deadline(signum, frame))
    except (ValueError, OSError, AttributeError):
        pass
    previous = signal.signal(signal.SIGALRM, deadline)
    signal.alarm(LIMIT_SECONDS)
    print('itea TikTok单项复测：1个公开主页，robots读取上限512KiB。' if args.only_tiktok else 'itea资料卡邮箱试采：2个平台主页，有邮箱保留，无邮箱跳过。', flush=True)
    print('单任务运行；最多14次HTTP尝试、约8MiB响应正文；不安装依赖、不登录、不修改网站。', flush=True)
    try:
        run_pilot(keyword=args.keyword, region=args.region, targets=[TARGETS[-1]] if args.only_tiktok else None, discover=args.keyword_probe and not args.only_tiktok)
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous)


if __name__ == '__main__':
    main()
