export const PLATFORMS = ["小红书", "抖音", "哔哩哔哩", "微博", "快手", "视频号", "Instagram", "TikTok", "其他"] as const;
export const CATEGORIES = ["美妆护肤", "时尚穿搭", "生活方式", "美食探店", "数码科技", "运动健康", "母婴亲子", "其他"] as const;
export const INFLUENCER_STATUSES = ["待联系", "沟通中", "已合作", "暂停合作"] as const;
export const PROJECT_STATUSES = ["待启动", "执行中", "已完成", "已取消"] as const;
export const CHANNELS = ["微信", "电话", "邮件", "平台私信", "线下", "其他"] as const;
export type Influencer = {
  id: string; name: string; handle: string; platform: string; category: string;
  followers: number; engagement: number; quote: number; status: string;
  contact: string; city: string; notes: string; createdAt: string; updatedAt: string;
};
export type Project = {
  id: string; name: string; brand: string; budget: number; status: string;
  startDate: string; endDate: string; description: string; influencerIds: string[];
  createdAt: string; updatedAt: string;
};
export type Followup = {
  id: string; influencerId: string; channel: string; date: string;
  nextDate: string; content: string; createdAt: string;
};
export type WorkspaceData = { influencers: Influencer[]; projects: Project[]; followups: Followup[] };
