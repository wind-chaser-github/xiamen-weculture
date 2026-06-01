const cloudHelper = require('../../../../../helper/cloud_helper.js');
const timeHelper = require('../../../../../helper/time_helper.js');
const pageHelper = require('../../../../../helper/page_helper.js');

Page({
	data: {
		list: []
	},

	onLoad: function (options) {
		this.loadData();
	},

	loadData: function () {
		let that = this;
		cloudHelper.callCloudData('ai/photo_list', {}, { title: '加载中' }).then(res => {
			if (res && res.list) {
				const list = res.list.map(item => {
					// 格式化时间
					const d = new Date(item.createTime);
					item.createTimeStr = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
					return item;
				});
				that.setData({ list: list });
			}
		}).catch(err => {
			wx.showToast({ title: '加载记录失败', icon: 'none' });
		});
	},

	previewImage: function (e) {
		const url = e.currentTarget.dataset.url;
		wx.previewImage({
			urls: [url]
		});
	},

	savePhoto: function (e) {
		const url = e.currentTarget.dataset.url;
		if (!url) return;
		
		wx.showLoading({ title: '下载中...' });
		wx.downloadFile({
			url: url,
			success: function (res) {
				if (res.statusCode === 200) {
					wx.saveImageToPhotosAlbum({
						filePath: res.tempFilePath,
						success: function () {
							wx.hideLoading();
							wx.showToast({ title: '保存成功', icon: 'success' });
						},
						fail: function () {
							wx.hideLoading();
							wx.showToast({ title: '保存取消或失败', icon: 'none' });
						}
					});
				} else {
					wx.hideLoading();
					wx.showToast({ title: '下载失败', icon: 'none' });
				}
			},
			fail: function () {
				wx.hideLoading();
				wx.showToast({ title: '下载失败', icon: 'none' });
			}
		});
	},

	deletePhoto: function (e) {
		const id = e.currentTarget.dataset.id;
		const that = this;
		wx.showModal({
			title: '确认删除',
			content: '删除后无法恢复，确定要删除这张合照吗？',
			success(res) {
				if (res.confirm) {
					cloudHelper.callCloudData('ai/photo_delete', { id: id }, { title: '删除中' }).then(res => {
						wx.showToast({ title: '删除成功', icon: 'success' });
						that.loadData();
					}).catch(err => {
						wx.showToast({ title: '删除失败', icon: 'none' });
					});
				}
			}
		});
	}
});
