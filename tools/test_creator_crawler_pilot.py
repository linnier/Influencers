import contextlib
import csv
from email.message import Message
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import time
import unittest

spec = importlib.util.spec_from_file_location('creator_pilot', Path(__file__).with_name('creator-crawler-pilot.py'))
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)


def response(text, status=200, content_type='text/html'):
    return {'status': status, 'url': 'https://sophieong.com/', 'text': text, 'content_type': content_type}


class FakeClient:
    real_network = False

    def __init__(self, pages):
        self.pages, self.requests, self.download_bytes = pages, 0, 0
        self.seen = []

    def get(self, url, max_bytes=pilot.PAGE_BYTES):
        self.requests += 1
        self.seen.append(url)
        value = self.pages[url]
        if isinstance(value, Exception):
            raise value
        self.download_bytes += len(value['text'].encode())
        return {**value, 'url': url}


class RawResponse:
    def __init__(self, text=b'', status=200, location=None, encoding=None):
        self.code, self.body = status, io.BytesIO(text)
        self.headers = Message()
        self.headers['Content-Type'] = 'text/html; charset=utf-8'
        if location:
            self.headers['Location'] = location
        if encoding:
            self.headers['Content-Encoding'] = encoding

    def read(self, count):
        return self.body.read(count)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.body.close()


class FakeOpener:
    def __init__(self, answers):
        self.answers, self.calls = list(answers), []

    def open(self, request, timeout):
        self.calls.append((request, timeout))
        return self.answers.pop(0)


class PilotTests(unittest.TestCase):
    def test_safe_targets(self):
        for value in ['http://www.instagram.com/a/', 'https://127.0.0.1/', 'https://[::1]/',
                      'https://instagram.com.evil.test/a/', 'https://user:pass@instagram.com/a/',
                      'https://instagram.com:444/a/', 'https://example.test/']:
            with self.assertRaises(ValueError):
                pilot.safe_url(value)
        for value in ['https://instagram.com/p/abc/', 'https://www.tiktok.com/@alice/video/123',
                      'https://www.instagram.com/accounts/']:
            self.assertIsNone(pilot.profile_url(value))
        self.assertEqual(pilot.profile_url('https://instagram.com/Alice/?igsh=x')[2], 'https://www.instagram.com/alice/')

    def test_profile_data_identity_zero_and_unknown(self):
        data = {'__DEFAULT_SCOPE__': {'webapp.user-detail': {'userInfo': {
            'user': {'uniqueId': 'alice', 'nickname': 'Alice', 'signature': 'Business: hello@creator.test'},
            'stats': {'followerCount': 0}}}}}
        source = '<script type="application/json">' + json.dumps(data) + '</script>'
        result = pilot.parse_page(source, 'https://www.tiktok.com/@alice')
        self.assertEqual(result['followers'], 0)
        self.assertEqual(result['emails'], ['hello@creator.test'])
        with self.assertRaises(ValueError):
            pilot.parse_page(source, 'https://www.tiktok.com/@other')
        meta = '<meta property="og:title" content="Alice (@alice) • Instagram"><meta name="description" content="12.3K followers; hello@creator.test">'
        self.assertIsNone(pilot.parse_page(meta, 'https://www.instagram.com/alice/')['followers'])
        with self.assertRaises(ValueError):
            pilot.parse_page('<title>Log in to see @alice</title>', 'https://www.instagram.com/alice/')

    def test_visible_contact_not_hidden_script(self):
        source = '<html><head><title>Creator contact</title><script>let x="hidden@creator.test";</script></head><body>For business collaboration, contact: public@ creator.test. Thank you for your interest.</body></html>'
        result = pilot.parse_page(source, 'https://sophieong.com/')
        self.assertEqual(result['emails'], ['public@creator.test'])
        self.assertIsNone(result['followers'])
        self.assertEqual(pilot.emails('a' * 1000000), [])

    def test_robots_restrictions_and_failures(self):
        client = FakeClient({'https://www.instagram.com/robots.txt': response('User-agent: *\nDisallow: /', content_type='text/plain')})
        row = pilot.checked_page(client, pilot.Robots(client), 'sample', 'https://www.instagram.com/alice/')
        self.assertEqual(row['status'], '跳过')
        self.assertEqual(client.requests, 1)
        client = FakeClient({'https://sophieong.com/robots.txt': response('<html>verify</html>')})
        self.assertFalse(pilot.Robots(client).allowed('https://sophieong.com/')[0])
        client = FakeClient({'https://sophieong.com/robots.txt': RuntimeError('network denied')})
        self.assertIn('未能确认', pilot.Robots(client).allowed('https://sophieong.com/')[1])

    def test_rss_is_not_fake_empty_and_profiles_only(self):
        source = '<rss><channel><item><link>https://instagram.com/alice/</link><title>Alice</title></item><item><link>https://instagram.com/p/abc/</link></item><item><link>https://instagram.com/alice/?igsh=x</link></item></channel></rss>'
        self.assertEqual(len(pilot.parse_feed(source)), 1)
        with self.assertRaises(ValueError):
            pilot.parse_feed('<html>Challenge</html>')
        with self.assertRaises(ValueError):
            pilot.parse_feed('<!DOCTYPE x><rss/>')
        self.assertEqual(pilot.parse_feed('<rss><channel/></rss>'), [])

    def test_http_limits_and_no_unsafe_redirect(self):
        client = pilot.Client()
        client.opener = FakeOpener([RawResponse(b'abcdef')])
        with self.assertRaisesRegex(ValueError, '读取上限'):
            client.get('https://sophieong.com/', max_bytes=3)
        self.assertEqual(client.requests, 1)
        client = pilot.Client()
        client.opener = FakeOpener([RawResponse(status=302, location='https://127.0.0.1/private')])
        with self.assertRaises(ValueError):
            client.get('https://sophieong.com/')
        self.assertEqual(len(client.opener.calls), 1)
        client = pilot.Client()
        client.deadline = time.monotonic() - 1
        with self.assertRaises(pilot.PilotStop):
            client.get('https://sophieong.com/')
        self.assertEqual(client.requests, 0)
        client = pilot.Client()
        client.opener = FakeOpener([RawResponse(b'blocked', status=403)])
        self.assertEqual(client.get('https://sophieong.com/')['status'], 403)
        self.assertEqual(len(client.opener.calls), 1)
        req = client.opener.calls[0][0]
        self.assertEqual(req.get_header('User-agent'), pilot.AGENT)
        self.assertIsNone(req.get_header('Cookie'))

    def test_report_isolated_and_accurate(self):
        client = FakeClient({
            'https://www.bing.com/robots.txt': response('User-agent: *\nDisallow: /search', content_type='text/plain'),
            'https://sophieong.com/robots.txt': response('', status=404),
            'https://sophieong.com/': response('<title>=formula</title><p>For business and collaborations please email public@creator.test. Thank you for your interest.</p>')})
        with tempfile.TemporaryDirectory() as temp:
            with contextlib.redirect_stdout(io.StringIO()):
                report, output = pilot.run_pilot(client, targets=[('sample', 'https://sophieong.com/')], output_root=temp)
            self.assertTrue(report['test_mode'])
            self.assertFalse(report['application_changes'])
            self.assertFalse(report['database_writes'])
            self.assertEqual(report['discovery']['status'], '跳过')
            self.assertIsNone(report['discovery']['candidate_count'])
            self.assertEqual(report['pages'][0]['emails'], ['public@creator.test'])
            self.assertEqual(report['resources']['http_attempts'], 3)
            self.assertGreater(report['resources']['process_peak_rss_mib'], 0)
            self.assertTrue((output / 'report.json').exists())
            with (output / 'public-contacts.csv').open(encoding='utf-8-sig') as stream:
                rows = list(csv.reader(stream))
            self.assertEqual(rows[1][2], "'=formula")
            self.assertEqual(rows[1][5], '')


if __name__ == '__main__':
    unittest.main(verbosity=2)
