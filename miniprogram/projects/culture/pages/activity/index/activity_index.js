const ProjectBiz = require('../../../biz/project_biz.js');
const pageHelper = require('../../../../../helper/page_helper.js');
const ActivityBiz = require('../../../biz/activity_biz.js');
const projectSetting = require('../../../public/project_setting.js');

Page({
	/**
	 * 页面的初始数据
	 */
	data: {
		isLoad: false,
		_params: null,

		sortMenus: [],
		sortItems: [],

		isShowCate: projectSetting.ACTIVITY_CATE.length > 1,
		selectedTag: '浪漫情侣',
		aiDays: ''
	},

	/**
		 * 生命周期函数--监听页面加载
		 */
	onLoad: async function (options) {
		ProjectBiz.initPage(this);


		if (options && options.id) {
			this.setData({
				isLoad: true,
				_params: {
					cateId: options.id,
				}
			});
			ActivityBiz.setCateTitle();
		} else {
			this._getSearchMenu();
			this.setData({
				isLoad: true
			});
		}
	},

	/**
	 * 生命周期函数--监听页面初次渲染完成
	 */
	onReady: function () { },

	/**
	 * 生命周期函数--监听页面显示
	 */
	onShow: async function () {

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

	url: async function (e) {
		pageHelper.url(e, this);
	},

	onSelectTag: function (e) {
		const tag = e.currentTarget.dataset.tag;
		this.setData({
			selectedTag: tag
		});
	},

	onDaysInput: function (e) {
		this.setData({
			aiDays: e.detail.value
		});
	},

	onAiGenerate: function () {
		const tag = this.data.selectedTag;
		const days = this.data.aiDays.trim() || '3天';
		const prompt = `我想进行一次厦门的“${tag}”主题旅行，预计玩 ${days}，请帮我规划一份专属行程，并智能推荐适合这个主题的小程序真实景点和活动！`;
		wx.navigateTo({
			url: `../../my/ai_chat/my_ai_chat?prompt=${encodeURIComponent(prompt)}`
		});
	},

	bindCommListCmpt: function (e) {
		pageHelper.commListListener(this, e);
	},


	onShareAppMessage: function () {

	},

	_getSearchMenu: function () {

		let sortItem1 = [{
			label: '全部',
			type: 'cateId',
			value: ''
		}];

		if (ActivityBiz.getCateList().length > 1)
			sortItem1 = sortItem1.concat(ActivityBiz.getCateList());

		let sortItems = [];
		let sortMenus = [ 
			...sortItem1, 
		];
		this.setData({
			sortItems,
			sortMenus
		})

	},

})