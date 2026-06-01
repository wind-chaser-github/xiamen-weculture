const cloudHelper = require('../../../../../helper/cloud_helper.js');
const pageHelper = require('../../../../../helper/page_helper.js');
const ProjectBiz = require('../../../biz/project_biz.js');
const PassportBiz = require('../../../../../comm/biz/passport_biz.js');

Page({
	/**
	 * 页面的初始数据
	 */
	data: {
		isLoad: false,
		aiSummary: '',
		// AI 合照相关状态
		showAiPhotoModal: false,
		isGeneratingPhoto: false,
		generatedPhotoUrl: ''
	},

	/**
	 * 生命周期函数--监听页面加载
	 */
	onLoad: async function (options) {
		ProjectBiz.initPage(this);

		if (!pageHelper.getOptions(this, options)) return;

		this._loadDetail();

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
		let product = await cloudHelper.callCloudData('product/view', params, opt);
		if (!product) {
			this.setData({
				isLoad: null
			})
			return;
		}

		this.setData({
			isLoad: true,
			product,
			aiSummary: ''
		});

		// 异步静默加载 AI 对该景点的亮点和避坑提炼
		cloudHelper.callCloudData('ai/summarize', { type: 'product', title: product.PRODUCT_TITLE }, { title: 'bar' }).then(res => {
			if (res && res.summary) {
				this.setData({
					aiSummary: res.summary
				});
			} else {
				this.setData({
					aiSummary: '智能导游阿鹭暂未总结此项目亮点，点击直接对话提问！'
				});
			}
		}).catch(err => {
			this.setData({
				aiSummary: '智能导游阿鹭暂未总结此项目亮点，点击直接对话提问！'
			});
		});

	},

	/**
	 * 生命周期函数--监听页面初次渲染完成
	 */
	onReady: function () { },

	/**
	 * 生命周期函数--监听页面显示
	 */
	onShow: function () { },

	/**
	 * 生命周期函数--监听页面隐藏
	 */
	onHide: function () { },

	/**
	 * 生命周期函数--监听页面卸载
	 */
	onUnload: function () { },

	/**
	 * 页面相关事件处理函数--监听用户下拉动作
	 */
	onPullDownRefresh: async function () {
		await this._loadDetail();
		wx.stopPullDownRefresh();
	},

	/**
	 * 页面上拉触底事件的处理函数
	 */
	onReachBottom: function () { },

	url: function (e) {
		pageHelper.url(e, this);
	},

	onAiAsk: function (e) {
		const title = e.currentTarget.dataset.title;
		wx.navigateTo({
			url: `../../my/ai_chat/my_ai_chat?prompt=我想去${title}，能帮我定制规划下行程并讲讲本地避坑指南吗？`
		});
	},

	onPreviewHistoryImage: function (e) {
		const current = e.currentTarget.dataset.current;
		const urls = this.data.product.historyImages.map(item => item.img);
		wx.previewImage({
			current: current,
			urls: urls
		});
	},

	// AI 景点合照功能
	onAiPhoto: async function () {
		if (!await PassportBiz.loginMustCancelWin(this)) return;

		let that = this;
		let historyImages = this.data.product.historyImages;
		
		// 如果有历史照片组，让用户选择打卡的年代
		if (historyImages && historyImages.length > 0) {
			let itemList = historyImages.map(item => item.time);
			// 加上默认的当前封面选项
			itemList.push('默认封面图');
			
			wx.showActionSheet({
				itemList: itemList,
				success(res) {
					let targetScene = '';
					if (res.tapIndex < historyImages.length) {
						targetScene = historyImages[res.tapIndex].img;
					} else {
						targetScene = that.data.product.PRODUCT_OBJ.cover[0];
					}
					that._doAiPhoto(targetScene);
				}
			});
		} else {
			// 没有历史组图，直接使用封面
			that._doAiPhoto(that.data.product.PRODUCT_OBJ.cover[0]);
		}
	},

	_doAiPhoto: function (targetScene) {
		let that = this;
		wx.chooseMedia({
			count: 1,
			mediaType: ['image'],
			sourceType: ['album', 'camera'],
			camera: 'front', // 推荐前置摄像头自拍
			success: function (res) {
				const tempFilePath = res.tempFiles[0].tempFilePath;
				that.setData({
					showAiPhotoModal: true,
					isGeneratingPhoto: true,
					generatedPhotoUrl: ''
				});

				// 获取基础 URL 和 Token 进行上传
				const setting = require('../../../../../setting/setting.js');
				const API_BASE_URL = setting.API_BASE_URL;
				const tokenObj = wx.getStorageSync('CACHE_TOKEN') || {};
				const token = tokenObj.id || '';

				// 1. 先上传自拍图
				wx.uploadFile({
					url: `${API_BASE_URL}/api/upload`,
					filePath: tempFilePath,
					name: 'file',
					header: {
						'Authorization': `Bearer ${token}`
					},
					success: function (uploadRes) {
						let uploadData = JSON.parse(uploadRes.data);
						if (uploadData.code === 200 && uploadData.data && uploadData.data.url) {
							const userImageUrl = uploadData.data.url;

							// 2. 调用 AI 生图接口
							cloudHelper.callCloudData('ai/generate_photo', {
								userImage: userImageUrl,
								targetScene: targetScene

							}, { title: '正在合成照片...', timeout: 60000 }).then(genRes => {
								if (genRes && genRes.url) {
									that.setData({
										isGeneratingPhoto: false,
										generatedPhotoUrl: genRes.url
									});
								} else {
									that.closeAiPhotoModal();
									wx.showToast({ title: '合成失败，请重试', icon: 'none' });
								}
							}).catch(err => {
								that.closeAiPhotoModal();
								wx.showToast({ title: '网络或AI服务异常', icon: 'none' });
							});

						} else {
							that.closeAiPhotoModal();
							wx.showModal({
								title: '上传失败',
								content: `服务器返回错误: ${uploadRes.data || '空数据'}`,
								showCancel: false
							});
						}
					},
					fail: function (err) {
						console.error('Upload file failed', err);
						that.closeAiPhotoModal();
						wx.showModal({
							title: '上传网路错误',
							content: `错误信息: ${err.errMsg || '未知网络错误'}\nPath: ${tempFilePath ? tempFilePath.substring(0, 30) : '空'}`,
							showCancel: false
						});
					}
				});
			}
		});
	},

	closeAiPhotoModal: function () {
		this.setData({
			showAiPhotoModal: false,
			isGeneratingPhoto: false,
			// generatedPhotoUrl: '' // 不清空的话下次打开还在，看需求
		});
	},

	previewGeneratedPhoto: function () {
		if (this.data.generatedPhotoUrl) {
			wx.previewImage({
				urls: [this.data.generatedPhotoUrl]
			});
		}
	},

	saveGeneratedPhoto: function () {
		const url = this.data.generatedPhotoUrl;
		if (!url) return;
		
		wx.downloadFile({
			url: url,
			success: function (res) {
				if (res.statusCode === 200) {
					wx.saveImageToPhotosAlbum({
						filePath: res.tempFilePath,
						success: function () {
							wx.showToast({ title: '保存成功', icon: 'success' });
						},
						fail: function () {
							wx.showToast({ title: '保存失败或取消', icon: 'none' });
						}
					});
				}
			}
		});
	},

	onPageScroll: function (e) {
		// 回页首按钮
		pageHelper.showTopBtn(e, this);

	},

	onShareAppMessage: function (res) {
		return {
			title: this.data.product.PRODUCT_TITLE,
			imageUrl: this.data.product.PRODUCT_OBJ.cover[0]
		}
	}
})