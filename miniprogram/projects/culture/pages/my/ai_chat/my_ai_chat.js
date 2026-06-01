const pageHelper = require('../../../../../helper/page_helper.js');
const cloudHelper = require('../../../../../helper/cloud_helper.js');
const PassportBiz = require('../../../../../comm/biz/passport_biz.js');
const ProjectBiz = require('../../../biz/project_biz.js');

Page({
  data: {
    chatList: [],
    inputVal: '',
    thinking: false,
    toView: '',
    chatId: '',
    userPic: ''
  },

  onLoad: function (options) {
    ProjectBiz.initPage(this);

    // 生成当前会话唯一ID
    const chatId = 'chat_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    this.setData({
      chatId,
      userPic: PassportBiz.isLogin() ? PassportBiz.getUserName() : '' // 尝试加载用户状态
    });

    // 载入用户真实头像
    this._loadUserAvatar();

    // AI 输出首句欢迎词
    this.addAiMessage('您好！我是您的厦门文博旅游智能助手。我可以为您定制个性化的旅游行程，或者帮您推荐厦门最热门的景点与活动。今天您想去哪里走走呢？');

    // 解析跳转传入的自动提问 prompt 参数并执行自动提问
    let prompt = options && options.prompt ? options.prompt : '';
    if (prompt) {
      try {
        prompt = decodeURIComponent(prompt);
      } catch (e) {
        console.error(e);
      }
      this.setData({
        inputVal: prompt
      });
      // 延迟 400 毫秒自动发送提问，确保界面欢迎语和动画加载自然
      setTimeout(() => {
        this.onSend();
      }, 400);
    }
  },

  _loadUserAvatar: async function () {
    try {
      const user = await cloudHelper.callCloudData('passport/my_detail', {}, { title: 'bar' });
      if (user && user.USER_PIC) {
        this.setData({
          userPic: user.USER_PIC
        });
      }
    } catch (e) {
      // 忽略头像加载错误
    }
  },

  // 辅助：解析消息中的 [标题|路径] 特殊格式
  parseMessage: function (text) {
    const recommends = [];
    const regex = /\[([^\]|]+)\|([^\]]+)\]/g;
    let match;
    let cleanText = text;

    while ((match = regex.exec(text)) !== null) {
      recommends.push({
        title: match[1],
        url: match[2]
      });
    }

    // 替换为加双引号的可读文本
    cleanText = cleanText.replace(regex, '“$1”');
    return { cleanText, recommends };
  },

  // 添加一条 AI 的回复消息
  addAiMessage: function (text) {
    const { cleanText, recommends } = this.parseMessage(text);
    const newMessage = {
      role: 'assistant',
      text,
      cleanText,
      recommends
    };

    const chatList = this.data.chatList.concat(newMessage);
    this.setData({
      chatList,
      toView: 'item_' + (chatList.length - 1)
    });
  },

  // 添加用户本人的消息
  addUserMessage: function (text) {
    const newMessage = {
      role: 'user',
      text,
      cleanText: text,
      recommends: []
    };

    const chatList = this.data.chatList.concat(newMessage);
    this.setData({
      chatList,
      toView: 'item_' + (chatList.length - 1)
    });
  },

  onInput: function (e) {
    this.setData({
      inputVal: e.detail.value
    });
  },

  onSend: async function () {
    if (this.data.thinking) return;
    const text = this.data.inputVal.trim();
    if (!text) return;

    this.addUserMessage(text);
    this.setData({
      inputVal: '',
      thinking: true,
      toView: 'thinking_node'
    });

    try {
      const opts = {
        title: 'bar' // 使用静默加载，让输入栏的闪烁点作为加载指示器，提升视觉高级感
      };
      
      const params = {
        text,
        chatId: this.data.chatId
      };

      const result = await cloudHelper.callCloudData('ai/chat', params, opts);
      this.setData({ thinking: false });

      if (result && result.reply) {
        this.addAiMessage(result.reply);
      } else {
        this.addAiMessage('智能助手未返回有效内容，请稍后再试。');
      }
    } catch (err) {
      this.setData({ thinking: false });
      console.error(err);
      this.addAiMessage('抱歉，获取 AI 回复失败了：' + (err.message || '网络连接错误'));
    }
  },

  goDetail: function (e) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      wx.navigateTo({
        url: url,
        fail: () => {
          // 兜底尝试 switchTab
          wx.switchTab({
            url: url
          });
        }
      });
    }
  },

  url: function (e) {
    pageHelper.url(e, this);
  }
});
