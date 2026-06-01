module.exports = {
	//### 环境相关 
	CLOUD_ID: '', //仅 BACKEND_MODE='cloud' 时需要填写
	BACKEND_MODE: 'http', //local=本地示例数据，http=自有服务器接口，cloud=微信云开发
	API_BASE_URL: 'https://tagen-preview.taowhale.com', //BACKEND_MODE='http' 时改成你的服务器地址

	// #### 版本信息 
	VER: 'build 2023.10.01',
	COMPANY: '厦门旅行指南',

	// #### 系统参数 
	IS_SUB: false, //分包模式 
	IS_DEMO: false, //是否演示版  

	MOBILE_CHECK: false, //手机号码是否真实性校验


	//#################     
	IMG_UPLOAD_SIZE: 20, //图片上传大小M兆    

	// #### 缓存相关
	CACHE_IS_LIST: true, //列表是否缓存
	CACHE_LIST_TIME: 60 * 30, //列表缓存时间秒    

}
