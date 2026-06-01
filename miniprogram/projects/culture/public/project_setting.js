module.exports = {
	PROJECT_COLOR: '#0F8B8D',
	NAV_COLOR: '#ffffff',
	NAV_BG: '#0F8B8D',


	// setup
	SETUP_CONTENT_ITEMS: [
		{ title: '关于我们', key: 'SETUP_CONTENT_ABOUT' },
	],

	// 用户
	USER_REG_CHECK: false,
	USER_FIELDS: [
		{ mark: 'sex', title: '性别', type: 'select', selectOptions: ['男', '女'], must: true },
	],
	USER_CHECK_FORM: {
		name: 'formName|must|string|min:1|max:30|name=昵称',
		mobile: 'formMobile|must|mobile|name=手机',
		pic: 'formPic|must|string|name=头像',
		forms: 'formForms|array'
	},


	NEWS_NAME: '旅行资讯',
	NEWS_CATE: [
		{ id: 1, title: '出行提示' },
		{ id: 2, title: '本地服务' },

	],
	NEWS_FIELDS: [
	],

	ACTIVITY_NAME: '行程',
	ACTIVITY_CATE: [
		{ id: 1, title: '城市漫游' },
		{ id: 2, title: '海岛路线' },
		{ id: 3, title: '美食体验' },
		{ id: 4, title: '夜游厦门' },
		{ id: 5, title: '亲子研学' },
		{ id: 6, title: '其他' },
	],
	ACTIVITY_FIELDS: [
		{ mark: 'time', title: '预计时长(小时)', type: 'digit', must: true },
		{ mark: 'fee', title: '参考费用', type: 'text', must: true },
		{ mark: 'desc', title: '行程亮点', type: 'content', must: true },
		{ mark: 'cover', title: '行程封面', type: 'image', min: 1, max: 8, must: true },
	],
	ACTIVITY_JOIN_FIELDS: [
		{ mark: 'name', type: 'text', title: '姓名', must: true, max: 30 },
		{ mark: 'phone', type: 'mobile', title: '手机', must: true, edit: false }
	],


	COMMENT_NAME: '评论',
	COMMENT_FIELDS: [
		{ mark: 'content', title: '评论内容', type: 'textarea', must: true },
		{ mark: 'img', title: '图片', type: 'image', min: 0, max: 8, must: false },

	],

	PRODUCT_NAME: '景点指南',
	PRODUCT_CATE: [
		{ id: 1, title: '鼓浪屿' },
		{ id: 2, title: '环岛路' },
		{ id: 3, title: '沙坡尾' },
		{ id: 4, title: '集美学村' },
		{ id: 5, title: '其他' },
	],
	PRODUCT_FIELDS: [
		{ mark: 'cover', title: '封面图片', type: 'image', len: 1, must: true },
		{ mark: 'desc', title: '简介', type: 'textarea', must: true, max: 100 },
		{ mark: 'content', title: '详情', type: 'content', must: true },
	],


	INFO_NAME: '旅行灵感',
	INFO_CATE: [
		{ id: 1, title: '海岸' },
		{ id: 2, title: '老街' },
		{ id: 3, title: '咖啡' },
		{ id: 4, title: '民宿' },
		{ id: 5, title: '其他' },
	],
	INFO_FIELDS: [
		{ mark: 'title', title: '标题', type: 'text', must: true, min: 5, max: 30 },
		{ mark: 'desc', title: '内容', type: 'content', must: true },
		{ mark: 'cover', title: '封面图', type: 'image', must: false, min: 1, max: 1 },
	],
}
