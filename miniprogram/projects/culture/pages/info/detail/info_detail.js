const pageHelper = require('../../../../../helper/page_helper.js');
const cloudHelper = require('../../../../../helper/cloud_helper.js');
const ProjectBiz = require('../../../biz/project_biz.js');
const InfoBiz = require('../../../biz/info_biz.js');
const PublicBiz = require('../../../../../comm/biz/public_biz.js');

Page({
	/**
	 * 页面的初始数据
	 */
	data: {
		isLoad: false,
		aiSummary: ''
	},

	/**
	 * 生命周期函数--监听页面加载
	 */
	onLoad: async function (options) {
		ProjectBiz.initPage(this);

		if (!pageHelper.getOptions(this, options, 'id')) return;

		await this._loadDetail();
	},

	_loadDetail: async function () {
		let id = this.data.id;
		if (!id) return;

		let params = {
			id,
		};
		let opt = {
			title: 'bar'
		};
		let info = await cloudHelper.callCloudData('info/view', params, opt);
		if (!info) {
			this.setData({
				isLoad: null
			})
			return;
		}

		this.setData({
			isLoad: true,
			info,
			aiSummary: ''
		});

		// 异步静默加载 AI 对该旅行灵感的精髓与亮点提炼
		cloudHelper.callCloudData('ai/summarize', { type: 'info', title: info.INFO_OBJ.title }, { title: 'bar' }).then(res => {
			if (res && res.summary) {
				this.setData({
					aiSummary: res.summary
				});
			} else {
				this.setData({
					aiSummary: '智能导游阿鹭暂未总结此灵感精髓，点击直接对话提问！'
				});
			}
		}).catch(err => {
			this.setData({
				aiSummary: '智能导游阿鹭暂未总结此灵感精髓，点击直接对话提问！'
			});
		});
	},

	/**
	 * 生命周期函数--监听页面初次渲染完成
	 */
	onReady: function () {

	},

	/**
	 * 生命周期函数--监听页面显示
	 */
	onShow: function () {

	},

	/**
	 * 生命周期函数--监听页面隐藏
	 */
	onHide: function () {

	},

	/**
	 * 生命周期函数--监听页面卸载
	 */
	onUnload: function () {

	},

	/**
	 * 页面相关事件处理函数--监听用户下拉动作
	 */
	onPullDownRefresh: async function () {
		await this._loadDetail();
		wx.stopPullDownRefresh();
	},

	onPageScroll: function (e) {
		// 回页首按钮
		pageHelper.showTopBtn(e, this);

	},

	/**
	 * 页面上拉触底事件的处理函数
	 */
	onReachBottom: function () {

	},
	url: function (e) {
		pageHelper.url(e, this);
	},

	onAiAsk: function (e) {
		const title = e.currentTarget.dataset.title;
		wx.navigateTo({
			url: `../../my/ai_chat/my_ai_chat?prompt=我想针对旅行灵感“${title}”定制详细的规划，能帮我把这个灵感扩展为具体的日程玩法、交通以及防坑建议吗？`
		});
	},

	onShareAppMessage: function (res) {
		return {
			title: this.data.info.INFO_OBJ.title,
			imageUrl: this.data.info.INFO_OBJ.cover[0]
		}
	}
})