const path = require('path');
const fs = require('fs');
const https = require('https');

const DB_FILE = path.join(__dirname, 'data', 'db.json');

// 导入小程序的 local_demo_data
const localData = require('../miniprogram/projects/culture/public/local_demo_data.js');

let db = {
	users: [],
	comments: [],
	joins: [],
	favs: [],
	infos: [],
	products: [],
	activities: [],
	news: [],
	mgrs: [],
	logs: [],
	aiPhotos: []
};

// 安全获取默认数据列表
function getListFromLocal(route) {
	try {
		const res = localData.getList(route, { page: 1, size: 1000 });
		return res && Array.isArray(res.list) ? res.list : [];
	} catch (e) {
		console.error(`Failed to get default list for ${route}:`, e);
		return [];
	}
}

function initDb() {
	const dir = path.dirname(DB_FILE);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	if (fs.existsSync(DB_FILE)) {
		try {
			const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
			db.users = Array.isArray(data.users) ? data.users : [];
			db.comments = Array.isArray(data.comments) ? data.comments : [];
			db.joins = Array.isArray(data.joins) ? data.joins : [];
			db.favs = Array.isArray(data.favs) ? data.favs : [];
			db.infos = Array.isArray(data.infos) ? data.infos : [];
			db.products = Array.isArray(data.products) ? data.products : [];
			db.activities = Array.isArray(data.activities) ? data.activities : [];
			db.news = Array.isArray(data.news) ? data.news : [];
			db.mgrs = Array.isArray(data.mgrs) ? data.mgrs : [];
			db.logs = Array.isArray(data.logs) ? data.logs : [];
			db.aiPhotos = Array.isArray(data.aiPhotos) ? data.aiPhotos : [];
			console.log('Database loaded successfully from db.json');
			replaceWithLocalUrls(db);
			saveDb();
		} catch (e) {
			console.error('Failed to parse db.json, using defaults', e);
			loadDefaults();
		}
	} else {
		loadDefaults();
		saveDb();
	}
}

function loadDefaults() {
	console.log('Initializing database with default mock data...');
	db.products = getListFromLocal('product/list');
	db.activities = getListFromLocal('activity/list');
	db.infos = getListFromLocal('info/list');
	db.news = getListFromLocal('news/list');
	db.comments = getListFromLocal('comment/list');
	db.joins = getListFromLocal('activity/my_join_list');
	db.users = getListFromLocal('admin/user_list');
	db.mgrs = getListFromLocal('admin/mgr_list');
	db.logs = getListFromLocal('admin/log_list');

	// 把默认的 demo-user 注入到用户表中，方便首次没有注册的用户能直接模拟
	const defaultUser = {
		_id: 'demo-user',
		USER_MINI_OPENID: 'demo-user',
		USER_NAME: '厦门游客',
		USER_PIC: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop',
		USER_STATUS: 1,
		USER_MOBILE: '13800000000',
		USER_FORMS: [],
		USER_ADD_TIME: '2026-05-18 12:00',
	};
	if (!db.users.some(u => u._id === 'demo-user')) {
		db.users.push(defaultUser);
	}

	// 初始默认收藏
	db.favs = [
		{ userId: 'demo-user', oid: 'xm-product-1' },
		{ userId: 'demo-user', oid: 'xm-activity-1' },
		{ userId: 'demo-user', oid: 'xm-info-1' }
	];

	// 转换并缓存 Unsplash URL
	replaceWithLocalUrls(db);
}

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
	fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function getLocalFilename(url) {
	const match = url.match(/photo-[a-zA-Z0-9-]+/);
	if (match) {
		return `${match[0]}.jpg`;
	}
	let hash = 0;
	for (let i = 0; i < url.length; i++) {
		hash = (hash << 5) - hash + url.charCodeAt(i);
		hash |= 0;
	}
	return `img_${Math.abs(hash)}.jpg`;
}

// 异步下载图片的函数，带超时与清理逻辑
function downloadImage(url, dest) {
	return new Promise((resolve, reject) => {
		const file = fs.createWriteStream(dest);
		const request = https.get(url, response => {
			if (response.statusCode !== 200) {
				file.close();
				fs.unlink(dest, () => {});
				reject(new Error(`Status code ${response.statusCode}`));
				return;
			}
			response.pipe(file);
			file.on('finish', () => {
				file.close(resolve);
			});
		});
		request.on('error', err => {
			file.close();
			fs.unlink(dest, () => {});
			reject(err);
		});
		request.setTimeout(10000, () => {
			request.destroy();
			file.close();
			fs.unlink(dest, () => {});
			reject(new Error('Timeout'));
		});
	});
}

const downloadQueue = [];
let downloading = false;

function addToQueue(url, filename) {
	const dest = path.join(UPLOAD_DIR, filename);
	if (fs.existsSync(dest)) {
		return;
	}
	if (downloadQueue.some(item => item.filename === filename)) {
		return;
	}
	downloadQueue.push({ url, filename, dest });
	triggerDownload();
}

function triggerDownload() {
	if (downloading || downloadQueue.length === 0) return;
	downloading = true;
	const { url, filename, dest } = downloadQueue.shift();
	console.log(`[Image Cache] Start downloading ${filename} from unsplash...`);
	downloadImage(url, dest)
		.then(() => {
			console.log(`[Image Cache] Successfully downloaded ${filename}`);
			downloading = false;
			triggerDownload();
		})
		.catch(err => {
			console.error(`[Image Cache] Failed to download ${filename}: ${err.message}`);
			downloading = false;
			// 延迟 1 秒处理下一个或重试
			setTimeout(triggerDownload, 1000);
		});
}

function replaceWithLocalUrls(obj) {
	if (!obj || typeof obj !== 'object') return;
	for (const key in obj) {
		if (typeof obj[key] === 'string') {
			if (obj[key].includes('unsplash.com')) {
				const filename = getLocalFilename(obj[key]);
				addToQueue(obj[key], filename);
				obj[key] = `__HOST__/public/uploads/${filename}`;
			}
		} else if (Array.isArray(obj[key])) {
			for (let i = 0; i < obj[key].length; i++) {
				if (typeof obj[key][i] === 'string' && obj[key][i].includes('unsplash.com')) {
					const filename = getLocalFilename(obj[key][i]);
					addToQueue(obj[key][i], filename);
					obj[key][i] = `__HOST__/public/uploads/${filename}`;
				} else if (typeof obj[key][i] === 'object') {
					replaceWithLocalUrls(obj[key][i]);
				}
			}
		} else if (typeof obj[key] === 'object') {
			replaceWithLocalUrls(obj[key]);
		}
	}
}

function saveDb() {
	try {
		fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
	} catch (e) {
		console.error('Failed to save db.json:', e);
	}
}

module.exports = {
	db,
	initDb,
	saveDb
};
