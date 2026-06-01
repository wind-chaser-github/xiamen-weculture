const ProjectBiz = require('../../../biz/project_biz.js');
const pageHelper = require('../../../../../helper/page_helper.js');
const ProductBiz = require('../../../biz/product_biz.js');
const cloudHelper = require('../../../../../helper/cloud_helper.js');

Page({
	/**
	 * 页面的初始数据
	 */
	data: {
		isLoad: false,
		_params: null,

		curMenu:'product_index',
		sortMenus: [],
		sortItems: [],
		aiRecommendText: ''
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
			ProductBiz.setCateTitle();
		} else {
			this._getSearchMenu();
			this.setData({
				isLoad: true
			});
		}

		// 静默异步加载今日 AI 推荐出游指数建议
		cloudHelper.callCloudData('ai/today_recommend', {}, { title: 'bar' }).then(res => {
			if (res && res.recommend) {
				this.setData({
					aiRecommendText: res.recommend
				});
			}
		}).catch(err => {
			console.error(err);
		});
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

	bindCommListCmpt: function (e) {
		pageHelper.commListListener(this, e);
		if (e.detail.dataList && e.detail.dataList.list) {
			wx.showToast({
				title: '加载了 ' + e.detail.dataList.list.length + ' 个景点',
				icon: 'none',
				duration: 3000
			});
		} else {
			wx.showToast({
				title: '获取列表为空',
				icon: 'none',
				duration: 3000
			});
		}
	},


	onShareAppMessage: function () {

	},

	_getSearchMenu: function () {

		let sortItem1 = [];

		if (ProductBiz.getCateList().length > 1) { 
			sortItem1 = [{
				label: '全部',
				type: 'cateId',
				value: ''
			}];
			sortItem1 = sortItem1.concat(ProductBiz.getCateList());
		}

		let sortItems = [];
		let sortMenus = sortItem1;
		this.setData({
			sortItems,
			sortMenus
		})

	}

})