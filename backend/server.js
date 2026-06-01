// 清除代理环境变量，防止本地开发时代理导致访问远程 AI 服务器 502 报错
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;

const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const { db, initDb, saveDb } = require('./db.js');
const WebSocket = require('ws');

// 微信小程序配置
const WX_APPID = 'wxb100b44af794708e';
const WX_SECRET = process.env.WX_APP_SECRET || ''; // 建议运行命令时提供，或直接从环境变量读取

// 微信 code 换 openid 函数
function getWechatOpenid(code) {
	return new Promise((resolve) => {
		if (!code) {
			resolve(null);
			return;
		}

		// 降级与Mock开发调试逻辑：如果未配置 WX_SECRET，或者 code 是 mock 的
		if (!WX_SECRET || code.startsWith('the_code_') || code === 'mock_code') {
			console.log(`[WeChat Login] WX_APP_SECRET not configured, generating mock openid for code: ${code}`);
			resolve(`mock-openid-${code}`);
			return;
		}

		const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${code}&grant_type=authorization_code`;
		
		https.get(url, (res) => {
			let data = '';
			res.on('data', (chunk) => {
				data += chunk;
			});
			res.on('end', () => {
				try {
					const json = JSON.parse(data);
					if (json.openid) {
						console.log(`[WeChat Login] Code successfully exchanged openid: ${json.openid}`);
						resolve(json.openid);
					} else {
						console.error('[WeChat Login] Code exchange error response:', json);
						// 微信报错时降级，不让接口直接崩掉，而是用 code 当 openid 降级处理
						resolve(`fallback-openid-${code}`);
					}
				} catch (err) {
					console.error('[WeChat Login] JSON parse error:', err);
					resolve(`fallback-openid-${code}`);
				}
			});
		}).on('error', (err) => {
			console.error('[WeChat Login] HTTPS request error:', err);
			resolve(`fallback-openid-${code}`);
		});
	});
}

// AI 业务内存缓存
const aiCache = {};

// 初始化数据库
initDb();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const CODE = {
	SUCC: 200,
	SVR: 500,
	LOGIC: 1600,
	DATA: 1301,
	ADMIN_ERROR: 2401
};

const EXPORT_DIR = path.join(__dirname, 'export');
if (!fs.existsSync(EXPORT_DIR)) {
	fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
	fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

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

function ok(data = {}) {
	return { code: CODE.SUCC, data };
}

function fail(msg, code = CODE.LOGIC) {
	return { code, msg };
}

function sendJson(res, status, payload, req = null) {
	let body = JSON.stringify(payload);
	if (req) {
		const host = req.headers.host || '127.0.0.1:3000';
		const protocol = (host.includes('127.0.0.1') || host.includes('localhost') || host.includes('115.190.164.187')) ? 'http' : 'https';
		body = body.replace(/__HOST__/g, `${protocol}://${host}`);
	}
	res.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization, token',
		'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
		'Connection': 'close',
		'Content-Length': Buffer.byteLength(body)
	});
	res.end(body);
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		let raw = '';
		req.on('data', chunk => {
			raw += chunk;
			if (raw.length > 1024 * 1024) {
				req.destroy();
				reject(new Error('Request body too large'));
			}
		});
		req.on('end', () => {
			if (!raw) {
				resolve({});
				return;
			}
			try {
				resolve(JSON.parse(raw));
			} catch (err) {
				reject(new Error('Invalid JSON body'));
			}
		});
		req.on('error', reject);
	});
}

function handleUpload(req, res) {
	console.log(`[Upload Request] Incoming file upload. Content-Type: ${req.headers['content-type']}`);
	const chunks = [];
	req.on('data', chunk => {
		chunks.push(chunk);
	});
	req.on('end', () => {
		try {
			const buffer = Buffer.concat(chunks);
			const contentType = req.headers['content-type'] || '';
			const boundaryMatch = contentType.match(/boundary=(.+)/);
			if (!boundaryMatch) {
				console.error('[Upload Request] Failed to find boundary in Content-Type:', contentType);
				sendJson(res, 400, fail('无 boundary 标记'));
				return;
			}
			const boundary = `--${boundaryMatch[1]}`;
			const boundaryBuffer = Buffer.from(boundary);
			const idx = buffer.indexOf(boundaryBuffer);
			if (idx === -1) {
				console.error('[Upload Request] Boundary buffer not found in body buffer');
				sendJson(res, 400, fail('未找到边界'));
				return;
			}
			const doubleCrlf = Buffer.from('\r\n\r\n');
			const headerStart = idx + boundaryBuffer.length;
			const contentStart = buffer.indexOf(doubleCrlf, headerStart);
			if (contentStart === -1) {
				console.error('[Upload Request] Failed to locate double CRLF in header part');
				sendJson(res, 400, fail('解析头部失败'));
				return;
			}
			const headerStr = buffer.slice(headerStart, contentStart).toString('utf8');
			const filenameMatch = headerStr.match(/filename="(.+?)"/);
			let ext = '.png';
			if (filenameMatch) {
				const extMatch = filenameMatch[1].match(/\.[^.]+$/);
				if (extMatch) ext = extMatch[0];
			}
			const fileDataStart = contentStart + doubleCrlf.length;
			const nextBoundaryIdx = buffer.indexOf(boundaryBuffer, fileDataStart);
			if (nextBoundaryIdx === -1) {
				console.error('[Upload Request] File data incomplete, missing trailing boundary');
				sendJson(res, 400, fail('文件流不完整'));
				return;
			}
			const fileDataEnd = nextBoundaryIdx - 2;
			const fileData = buffer.slice(fileDataStart, fileDataEnd);

			const filename = `img_${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`;
			const filepath = path.join(UPLOAD_DIR, filename);
			fs.writeFileSync(filepath, fileData);

			const host = req.headers.host || '127.0.0.1:3000';
			const url = `http://${host}/public/uploads/${filename}`;

			console.log(`[Upload Request] File successfully uploaded. Saved to: ${filepath}, public url: ${url}`);
			sendJson(res, 200, ok({ url }));
		} catch (e) {
			console.error('[Upload Request] Internal parse exception:', e);
			sendJson(res, 500, fail('解析上传文件发生内部错误'));
		}
	});
	req.on('error', err => {
		console.error('[Upload Request] Stream receive error:', err);
		sendJson(res, 500, fail('接收上传文件发生连接错误'));
	});
}

function getFormVal(forms, mark, fallback = '') {
	if (!Array.isArray(forms)) return fallback;
	const item = forms.find(one => one.mark === mark || one.title === mark);
	return item ? (item.val || item.value || fallback) : fallback;
}

function matchKeyword(item, keyword) {
	if (!keyword) return true;
	const raw = JSON.stringify(item);
	return raw.indexOf(keyword) > -1;
}

function filterByParams(list, params = {}, cateKey) {
	let result = list;
	const cateId = params.cateId || (params.sortType === 'cateId' ? params.sortVal : '');
	if (cateId) result = result.filter(item => item[cateKey] === String(cateId));
	if (params.search) result = result.filter(item => matchKeyword(item, params.search));
	return result;
}

function pageList(list, page = 1, size = 20) {
	const start = (page - 1) * size;
	const pageItems = list.slice(start, start + size);
	return {
		page,
		size,
		list: pageItems,
		count: Math.ceil(list.length / size),
		total: list.length,
		oldTotal: list.length
	};
}

function getRealList(route, params = {}, token = '') {
	const page = params.page || 1;
	const size = params.size || 20;

	if (route === 'product/list') return pageList(filterByParams(db.products, params, 'PRODUCT_CATE_ID'), page, size);
	if (route === 'activity/list') return pageList(filterByParams(db.activities, params, 'ACTIVITY_CATE_ID'), page, size);
	if (route === 'info/list') return pageList(filterByParams(db.infos, params, 'INFO_CATE_ID'), page, size);
	
	if (route === 'info/my_list') {
		const myInfos = db.infos.filter(item => item.INFO_USER_ID === token);
		return pageList(filterByParams(myInfos, params, 'INFO_CATE_ID'), page, size);
	}

	if (route === 'news/list') return pageList(filterByParams(db.news, params, 'NEWS_CATE_ID'), page, size);
	if (route === 'comment/list') return pageList(db.comments.filter(item => matchKeyword(item, params.search)), page, size);
	if (route === 'activity/my_join_list') return pageList(db.joins.filter(item => matchKeyword(item, params.search)), page, size);

	if (route === 'fav/my_list') {
		const myFavs = db.favs.filter(f => f.userId === token);
		const list = [];
		myFavs.forEach(f => {
			let found = null;
			let type = '';
			let path = '';
			
			found = db.products.find(p => p._id === f.oid);
			if (found) {
				type = '景点';
				path = `/projects/culture/pages/product/detail/product_detail?id=${found._id}`;
			} else {
				found = db.activities.find(a => a._id === f.oid);
				if (found) {
					type = '行程';
					path = `/projects/culture/pages/activity/detail/activity_detail?id=${found._id}`;
				} else {
					found = db.infos.find(i => i._id === f.oid);
					if (found) {
						type = '灵感';
						path = `/projects/culture/pages/info/detail/info_detail?id=${found._id}`;
					}
				}
			}

			if (found) {
				list.push({
					_id: `fav-${f.oid}`,
					FAV_OID: f.oid,
					FAV_TITLE: found.PRODUCT_TITLE || found.ACTIVITY_TITLE || found.INFO_OBJ?.title || '旅行内容',
					FAV_TYPE: type,
					FAV_PATH: path,
					FAV_ADD_TIME: new Date().toISOString().slice(0, 10)
				});
			}
		});

		return pageList(list.filter(item => matchKeyword(item, params.search)), page, size);
	}
	
	return pageList([], page, size);
}

async function handleRoute(route, params = {}, token = '', host = '127.0.0.1:3000') {
	switch (route) {
		// #### 用户登录注册与详情
		case 'passport/login': {
			// 1. 优先尝试使用已有的 token 查找用户
			if (token) {
				const user = db.users.find(u => u._id === token || u.USER_MINI_OPENID === token);
				if (user) {
					return ok({
						token: {
							id: user._id,
							name: user.USER_NAME,
							pic: user.USER_PIC,
							status: user.USER_STATUS
						}
					});
				}
			}
			
			// 2. 如果没有 token，但有小程序上传的 code，尝试通过微信 openid 自动静默登录
			if (params.code) {
				const openid = await getWechatOpenid(params.code);
				if (openid) {
					const user = db.users.find(u => u.USER_MINI_OPENID === openid);
					if (user) {
						console.log(`[Passport Login] Automatically logging in user with openid: ${openid}`);
						return ok({
							token: {
								id: user._id,
								name: user.USER_NAME,
								pic: user.USER_PIC,
								status: user.USER_STATUS
							}
						});
					}
				}
			}

			return ok({ token: null });
		}

		case 'passport/register': {
			let openid = '';
			if (params.code) {
				openid = await getWechatOpenid(params.code);
			}

			// 如果解出来 openid，就作为唯一标识，否则回退到基于随机数和时间戳的唯一ID
			const _id = openid ? `user-openid-${openid}` : `user-openid-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
			const miniOpenid = openid || _id;

			// 检查是否已经存在该 openid 的用户，防止重复注册
			const existUser = db.users.find(u => u.USER_MINI_OPENID === miniOpenid);
			if (existUser) {
				return ok({
					token: {
						id: existUser._id,
						name: existUser.USER_NAME,
						pic: existUser.USER_PIC,
						status: existUser.USER_STATUS
					}
				});
			}

			const newUser = {
				_id,
				USER_MINI_OPENID: miniOpenid,
				USER_NAME: params.formName || params.name || '新用户',
				USER_PIC: params.pic || '/projects/culture/images/tabbar/my_cur.png',
				USER_STATUS: params.status !== undefined ? params.status : 1,
				USER_MOBILE: params.formMobile || params.mobile || '',
				USER_FORMS: params.forms || [],
				USER_ADD_TIME: new Date().toISOString().slice(0, 19).replace('T', ' '),
			};
			db.users.push(newUser);
			saveDb();

			return ok({
				token: {
					id: newUser._id,
					name: newUser.USER_NAME,
					pic: newUser.USER_PIC,
					status: newUser.USER_STATUS
				}
			});
		}

		case 'passport/my_detail': {
			const user = db.users.find(u => u._id === token || u.USER_MINI_OPENID === token);
			return ok(user || null);
		}

		case 'passport/edit_base': {
			const user = db.users.find(u => u._id === token || u.USER_MINI_OPENID === token);
			if (!user) return fail('用户未找到，请重新登录');

			user.USER_NAME = params.formName || params.name || user.USER_NAME;
			user.USER_MOBILE = params.formMobile || params.mobile || user.USER_MOBILE;
			user.USER_PIC = params.pic || user.USER_PIC;
			user.USER_FORMS = params.forms || user.USER_FORMS;
			saveDb();

			return ok(true);
		}

		case 'passport/phone':
			return ok('13800000000');

		// #### 收藏管理
		case 'fav/is_fav': {
			const oid = params.oid || params.id;
			const isFav = db.favs.some(f => f.userId === token && f.oid === oid);
			return ok({ isFav: isFav ? 1 : 0 });
		}

		case 'fav/update': {
			const oid = params.oid || params.id;
			if (!oid) return fail('缺少收藏对象');

			const idx = db.favs.findIndex(f => f.userId === token && f.oid === oid);
			if (idx > -1) {
				db.favs.splice(idx, 1);
			} else {
				db.favs.push({ userId: token, oid });
			}
			saveDb();

			const isFav = db.favs.some(f => f.userId === token && f.oid === oid);
			return ok({ isFav: isFav ? 1 : 0 });
		}

		case 'fav/del': {
			const oid = params.oid || params.id;
			const idx = db.favs.findIndex(f => f.userId === token && f.oid === oid);
			if (idx > -1) {
				db.favs.splice(idx, 1);
				saveDb();
			}
			return ok(true);
		}

		// #### 评论管理
		case 'comment/insert': {
			const user = db.users.find(u => u._id === token || u.USER_MINI_OPENID === token);
			if (!user) return fail('请先登录注册');
			const content = params.forms?.content || params.content || params.formContent || '本地评论';
			const oid = params.id || params.oid || '';
			
			const item = {
				_id: `comment-${Date.now()}`,
				COMMENT_ADD_TIME: new Date().toISOString().slice(0, 19).replace('T', ' '),
				COMMENT_USER_ID: user._id,
				COMMENT_OBJ: { content, img: params.forms?.img || [] },
				COMMENT_OID: oid,
				user: {
					USER_NAME: user.USER_NAME,
					USER_PIC: user.USER_PIC
				}
			};
			db.comments.unshift(item);

			let matchedObj = null;
			if (oid.startsWith('xm-product-')) {
				matchedObj = db.products.find(p => p._id === oid);
			} else if (oid.startsWith('xm-activity-')) {
				matchedObj = db.activities.find(a => a._id === oid);
			} else if (oid.startsWith('xm-info-') || oid.startsWith('info-')) {
				matchedObj = db.infos.find(i => i._id === oid);
			}
			if (matchedObj) {
				if (matchedObj.ACTIVITY_COMMENT_CNT !== undefined) matchedObj.ACTIVITY_COMMENT_CNT++;
				if (matchedObj.INFO_COMMENT_CNT !== undefined) matchedObj.INFO_COMMENT_CNT++;
			}

			saveDb();
			return ok(item);
		}

		case 'comment/del': {
			const id = params.id;
			const idx = db.comments.findIndex(c => c._id === id);
			if (idx > -1) {
				const oid = db.comments[idx].COMMENT_OID;
				db.comments.splice(idx, 1);

				let matchedObj = null;
				if (oid.startsWith('xm-product-')) {
					matchedObj = db.products.find(p => p._id === oid);
				} else if (oid.startsWith('xm-activity-')) {
					matchedObj = db.activities.find(a => a._id === oid);
				} else if (oid.startsWith('xm-info-') || oid.startsWith('info-')) {
					matchedObj = db.infos.find(i => i._id === oid);
				}
				if (matchedObj) {
					if (matchedObj.ACTIVITY_COMMENT_CNT !== undefined && matchedObj.ACTIVITY_COMMENT_CNT > 0) matchedObj.ACTIVITY_COMMENT_CNT--;
					if (matchedObj.INFO_COMMENT_CNT !== undefined && matchedObj.INFO_COMMENT_CNT > 0) matchedObj.INFO_COMMENT_CNT--;
				}
				saveDb();
			}
			return ok(true);
		}

		// #### 旅行灵感
		case 'info/insert': {
			const user = db.users.find(u => u._id === token || u.USER_MINI_OPENID === token);
			if (!user) return fail('请先登录注册');
			const id = `info-${Date.now()}`;
			
			const forms = params.forms || [];
			const title = params.title || params.formTitle || getFormVal(forms, '标题', '我的厦门旅行灵感');
			const desc = getFormVal(forms, '内容', '旅行灵感内容');
			const cateId = String(params.cateId || 1);
			const cateName = params.cateName || '海岸';

			const item = {
				_id: id,
				INFO_CATE_ID: cateId,
				INFO_CATE_NAME: cateName,
				INFO_OBJ: {
					title,
					cover: params.pic ? [params.pic] : ['https://images.unsplash.com/photo-1464746133101-a2c3f88e0dd9?w=600&fit=crop'],
					desc: [{ type: 'text', val: desc }]
				},
				INFO_VIEW_CNT: 0,
				INFO_COMMENT_CNT: 0,
				INFO_ADD_TIME: new Date().toISOString().slice(0, 19).replace('T', ' '),
				user: {
					USER_NAME: user.USER_NAME,
					USER_PIC: user.USER_PIC
				},
				INFO_ORDER: 999,
				INFO_VOUCH: 0,
				INFO_STATUS: 1,
				INFO_USER_ID: user._id,
				INFO_QR: ''
			};

			db.infos.unshift(item);
			saveDb();

			return ok({ id });
		}

		case 'info/my_info_del': {
			const id = params.id;
			const idx = db.infos.findIndex(item => item._id === id && item.INFO_USER_ID === token);
			if (idx > -1) {
				db.infos.splice(idx, 1);
				saveDb();
			}
			return ok(true);
		}

		case 'info/view':
		case 'info/my_info_detail': {
			const id = params.id;
			const info = db.infos.find(item => item._id === id);
			if (info) {
				if (route === 'info/view') {
					info.INFO_VIEW_CNT = (info.INFO_VIEW_CNT || 0) + 1;
					saveDb();
				}
				return ok(info);
			}
			return fail('内容不存在');
		}

		// #### 景点详情
		case 'product/view': {
			const foundProduct = db.products.find(item => item._id === params.id);
			if (foundProduct) {
				foundProduct.PRODUCT_VIEW_CNT = (foundProduct.PRODUCT_VIEW_CNT || 0) + 1;
				saveDb();

				// 浅拷贝对象，防止将动态的 historyImages 写入 db.json 导致数据库臃肿
				const product = { ...foundProduct };

				const title = product.PRODUCT_TITLE || '';
				const cateName = product.PRODUCT_CATE_NAME || '';

				if (title.indexOf('鼓浪屿') > -1 || title.indexOf('日光岩') > -1 || title.indexOf('菽庄花园') > -1 || cateName.indexOf('鼓浪屿') > -1) {
					product.historyImages = [
						{
							time: '1890 年代',
							img: '__HOST__/public/uploads/gulangyu_1890.jpg',
							desc: '鼓浪屿开埠初期，海岸线空旷宁静，零星分布着早期西式石质别墅，是与大自然对话的避世小岛。'
						},
						{
							time: '1920 年代',
							img: '__HOST__/public/uploads/gulangyu_1920.jpg',
							desc: '迎来黄金繁荣期，万国建筑博览会在岛上兴起，华侨老别墅错落有致，洋溢着欧陆庭园风情。'
						},
						{
							time: '1980 年代',
							img: '__HOST__/public/uploads/gulangyu_1980.jpg',
							desc: '宁静祥和的居民生活期。琴声从榕树荫下的红砖深巷里悠扬飘出，充满诗情画意。'
						},
						{
							time: '今日现状',
							img: '__HOST__/public/uploads/gulangyu_now.jpg',
							desc: '被列入世界文化遗产，时尚文艺与古典建筑在这里交织，成为每个人心中向往的浪漫诗意之岛。'
						}
					];
				} else if (title.indexOf('沙坡尾') > -1 || cateName.indexOf('沙坡尾') > -1) {
					product.historyImages = [
						{
							time: '1900 年代',
							img: '__HOST__/public/uploads/shapowei_1900.jpg',
							desc: '古老的海上避风港，清代传统木质双桅渔船聚集。岸边搭起简易的吊脚楼木屋，厦门港的源头。'
						},
						{
							time: '1980 年代',
							img: '__HOST__/public/uploads/shapowei_1980.jpg',
							desc: '繁忙的国营老港区，老红砖骑楼依水而建。成百上千木质帆船满载渔获归港，充满市井烟火气。'
						},
						{
							time: '2010 年代',
							img: '__HOST__/public/uploads/shapowei_2010.jpg',
							desc: '老港区向艺术街区转型初期。斑驳的厂房外绘上了色彩斑斓的现代涂鸦，重唤潮流朝气。'
						},
						{
							time: '今日现状',
							img: '__HOST__/public/uploads/shapowei_now.jpg',
							desc: '老避风坞成为潮流文化地标。潮流小店、文创园和年轻人在水畔相聚，保留了渔港灵气与活力。'
						}
					];
				} else if (cateName.indexOf('环岛路') > -1) {
					product.historyImages = [
						{
							time: '1920 年代',
							img: '__HOST__/public/uploads/huandao_1920.jpg',
							desc: '未开发的原始海岸线，礁石嶙峋，崎岖小道沿海蜿蜒，零星渔村依山而建，风光荒野天成。'
						},
						{
							time: '1980 年代',
							img: '__HOST__/public/uploads/huandao_1980.jpg',
							desc: '改革开放初期，海边正在修筑最早的沿海公路，渔船点点，岸边岗楼仍是军事要地，一切都刚刚起步。'
						},
						{
							time: '今日现状',
							img: '__HOST__/public/uploads/huandao_now.jpg',
							desc: '厦门最美骑行线路，宽阔专用自行车道紧贴海岸线延伸，棕榈椰树成荫，对岸鼓浪屿清晰可见。'
						}
					];
				} else if (cateName.indexOf('集美学村') > -1) {
					product.historyImages = [
						{
							time: '1920 年代',
							img: '__HOST__/public/uploads/jimei_1920.jpg',
							desc: '陈嘉庚先生初建集美学村时期，嘉庚式建筑融合中式飞翘屋脊与西式红砖拱廊，临海而立，孤绝壮观。'
						},
						{
							time: '1980 年代',
							img: '__HOST__/public/uploads/jimei_1980.jpg',
							desc: '龙舟池畔，嘉庚建筑倒映水中，骑车的学生和悠闲散步的居民构成一幅恬静岁月图景。'
						},
						{
							time: '今日现状',
							img: '__HOST__/public/uploads/jimei_now.jpg',
							desc: '百年学村焕新颜，精心整修的嘉庚建筑群与龙舟池水景相映成趣，成为厦门文化游学的重要目的地。'
						}
					];
				} else {
					// 其他分类（中山路、八市、植物园、钟鼓索道、海湾公园等）统一使用老城区历史图组
					product.historyImages = [
						{
							time: '1920 年代',
							img: '__HOST__/public/uploads/laocheng_1920.jpg',
							desc: '民国繁华时期，中山路一带骑楼商肆鳞次栉比，黄包车穿梭往来，是闽南最繁华的商业街区。'
						},
						{
							time: '1980 年代',
							img: '__HOST__/public/uploads/laocheng_1980.jpg',
							desc: '改革开放初期，八市与中山路的日常图景：国营商店、自行车、市井小吃，烟火气扑面而来。'
						},
						{
							time: '今日现状',
							img: '__HOST__/public/uploads/laocheng_now.jpg',
							desc: '古老骑楼与现代商业交织共存，中山路夜市烟火气十足，是感受厦门本土生活气息的最佳去处。'
						}
					];
				}

				return ok(product);
			}
			return fail('景点不存在');
		}

		// #### 行程报名
		case 'activity/view':
		case 'activity/detail_for_join': {
			const activity = db.activities.find(item => item._id === params.id);
			return ok(activity || null);
		}

		case 'activity/join': {
			const activityId = params.id || params.activityId;
			const activity = db.activities.find(a => a._id === activityId);
			if (!activity) return fail('行程未找到');

			if (activity.ACTIVITY_MAX_CNT && activity.ACTIVITY_JOIN_CNT >= activity.ACTIVITY_MAX_CNT) {
				return fail('报名人数已满');
			}

			const user = db.users.find(u => u._id === token || u.USER_MINI_OPENID === token);
			if (!user) return fail('请先登录注册');
			const id = `join-${Date.now()}`;
			const item = {
				_id: id,
				ACTIVITY_JOIN_CODE: id,
				ACTIVITY_JOIN_ACTIVITY_ID: activityId,
				ACTIVITY_JOIN_STATUS: 1,
				ACTIVITY_JOIN_IS_CHECKIN: 0,
				ACTIVITY_JOIN_FORMS: params.forms || [],
				ACTIVITY_JOIN_ADD_TIME: new Date().toISOString().slice(0, 19).replace('T', ' '),
				ACTIVITY_JOIN_USER_ID: user._id,
				activity: {
					_id: activity._id,
					ACTIVITY_TITLE: activity.ACTIVITY_TITLE,
					ACTIVITY_OBJ: activity.ACTIVITY_OBJ
				},
				time: activity.time || activity.ACTIVITY_START || '',
				isTimeout: false
			};

			db.joins.unshift(item);
			activity.ACTIVITY_JOIN_CNT = (activity.ACTIVITY_JOIN_CNT || 0) + 1;
			saveDb();

			return ok({ id, activityJoinId: id, check: 0 });
		}

		case 'activity/my_join_cancel': {
			const id = params.id || params.activityJoinId;
			const idx = db.joins.findIndex(j => j._id === id && j.ACTIVITY_JOIN_USER_ID === token);
			if (idx > -1) {
				const join = db.joins[idx];
				const activityId = join.ACTIVITY_JOIN_ACTIVITY_ID;
				db.joins.splice(idx, 1);

				const activity = db.activities.find(a => a._id === activityId);
				if (activity && activity.ACTIVITY_JOIN_CNT > 0) {
					activity.ACTIVITY_JOIN_CNT--;
				}
				saveDb();
			}
			return ok(true);
		}

		case 'activity/my_join_detail': {
			const join = db.joins.find(j => j._id === (params.activityJoinId || params.id));
			return ok(join || null);
		}

		case 'activity/list_by_day': {
			const dayStr = params.day || '';
			let startIdx = 0;
			let num = 3;
			if (dayStr) {
				const lastChar = dayStr.slice(-1);
				const seed = isNaN(lastChar) ? 2 : parseInt(lastChar);
				startIdx = (seed * 3) % db.activities.length;
				num = (seed % 3) + 2;
			}
			const dayActivities = [];
			for (let i = 0; i < num; i++) {
				dayActivities.push(db.activities[(startIdx + i) % db.activities.length]);
			}
			return ok(dayActivities.map(item => ({
				_id: item._id,
				pic: item.ACTIVITY_OBJ.cover[0],
				title: item.ACTIVITY_TITLE,
				timeDesc: item.time || item.start
			})));
		}

		case 'activity/list_has_day':
			return ok(['2026-05-28', '2026-05-29', '2026-05-30', '2026-06-01']);

		case 'activity/my_join_self': {
			const id = params.activityJoinId || params.id;
			const join = db.joins.find(j => j._id === id);
			if (join) {
				join.ACTIVITY_JOIN_IS_CHECKIN = 1;
				join.ACTIVITY_JOIN_CHECKIN_TIME = new Date().toISOString().slice(0, 19).replace('T', ' ');
				saveDb();
				return ok({ ret: '签到成功，请在「个人中心 - 我的行程报名」查看详情。' });
			}
			return fail('找不到该报名记录');
		}

		// #### 首页和列表路由
		case 'home/list':
			return ok({
				productList: db.products.slice(0, 10),
				activityList: db.activities.slice(0, 10),
				infoList: db.infos.slice(0, 10)
			});

		case 'ai/generate_photo': {
			const user = db.users.find(u => u._id === token || u.USER_MINI_OPENID === token);
			if (!user) return { code: CODE.LOGIC, msg: '请先登录注册' };
			let { userImage, targetScene } = params;
			
			if (!userImage || !targetScene) {
				return { code: 500, msg: '缺少必要的图片参数' };
			}

			if (targetScene.includes('__HOST__')) {
				const protocol = (host.includes('127.0.0.1') || host.includes('localhost') || host.includes('115.190.164.187')) ? 'http' : 'https';
				targetScene = targetScene.replace('__HOST__', `${protocol}://${host}`);
			}

			const API_KEY = '868be6ae-cc2e-4948-ad95-1cd87a3c50bc';
			const reqBody = {
				model: 'doubao-seedream-5-0-260128',
				prompt: '请将人物（第一张图）自然地融合到这张风景图中（第二张图），作为在厦门旅游打卡的照片。保持风景不变，人物特征保留，风格要真实自然。',
				image: [userImage, targetScene]
			};

			return new Promise((resolve, reject) => {
				const https = require('https');
				const options = {
					hostname: 'ark.cn-beijing.volces.com',
					port: 443,
					path: '/api/v3/images/generations',
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${API_KEY}`
					}
				};

				const volcReq = https.request(options, volcRes => {
					let body = '';
					volcRes.on('data', d => body += d);
					volcRes.on('end', () => {
						try {
							const result = JSON.parse(body);
							if (result && result.data && result.data[0] && result.data[0].url) {
								const tosUrl = result.data[0].url;
								const fileName = `ai_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpeg`;
								const filePath = path.join(UPLOAD_DIR, fileName);
								
								// 下载图片保存到本地
								https.get(tosUrl, (imgRes) => {
									const fileStream = fs.createWriteStream(filePath);
									imgRes.pipe(fileStream);
									fileStream.on('finish', () => {
										fileStream.close();
										const localUrlPath = `public/uploads/${fileName}`;
										const protocol = (host.includes('127.0.0.1') || host.includes('localhost') || host.includes('115.190.164.187')) ? 'http' : 'https';
										const finalUrl = `${protocol}://${host}/${localUrlPath}`; // 使用正确的协议和主机名

										// 保存到数据库记录
										const record = {
											id: 'aiphoto_' + Date.now(),
											userId: user._id, // 依赖外层的 user 对象解析
											url: finalUrl,
											originalImage: userImage,
											targetScene: targetScene,
											createTime: Date.now()
										};
										if (!db.aiPhotos) db.aiPhotos = [];
										db.aiPhotos.unshift(record);
										saveDb();

										resolve({
											code: 200,
											data: {
												url: finalUrl,
												status: 'success'
											}
										});
									});
								}).on('error', (err) => {
									console.error('Download TOS image Error:', err);
									resolve({ code: 500, msg: '下载生成的图片失败' });
								});

							} else {
								console.error('Volcengine Image Generation Error:', result);
								resolve({ code: 500, msg: 'AI 合成失败，请检查照片是否清晰' });
							}
						} catch (e) {
							console.error('Volcengine JSON parse Error:', e);
							resolve({ code: 500, msg: 'AI 接口解析异常' });
						}
					});
				});

				volcReq.on('error', e => {
					console.error('Volcengine HTTP Request Error:', e);
					resolve({ code: 500, msg: 'AI 服务请求异常' });
				});

				volcReq.write(JSON.stringify(reqBody));
				volcReq.end();
			});
		}

		case 'ai/photo_list': {
			const user = db.users.find(u => u._id === token || u.USER_MINI_OPENID === token);
			if (!user) return fail('请先登录注册');
			if (!db.aiPhotos) db.aiPhotos = [];
			const list = db.aiPhotos.filter(p => p.userId === user._id).sort((a, b) => b.createTime - a.createTime);
			return ok({ list });
		}

		case 'ai/photo_delete': {
			const user = db.users.find(u => u._id === token || u.USER_MINI_OPENID === token);
			if (!user) return fail('请先登录注册');
			const { id } = params;
			if (!db.aiPhotos) db.aiPhotos = [];
			const index = db.aiPhotos.findIndex(p => p.id === id && p.userId === user._id);
			if (index > -1) {
				const record = db.aiPhotos[index];
				// 物理删除文件 (解析出相对路径并删除)
				try {
					if (record.url) {
						const urlParts = record.url.split('/public/uploads/');
						if (urlParts.length === 2) {
							const fileName = urlParts[1];
							const filePath = path.join(UPLOAD_DIR, fileName);
							if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
						}
					}
				} catch (e) {
					console.error('Delete photo file failed', e);
				}
				db.aiPhotos.splice(index, 1);
				saveDb();
			}
			return ok();
		}

		case 'ai/chat': {
			try {
				const userText = params.text || '';
				if (!userText.trim()) {
					return ok({ reply: '你好！我是厦门智能文旅助手。今天你想去哪里玩，或者需要我帮你推荐什么行程呢？' });
				}

				// 1. RAG 景点与活动匹配检索
				let matchedProducts = db.products.filter(p => {
					const title = p.PRODUCT_TITLE || '';
					const desc = p.PRODUCT_OBJ?.desc || '';
					return (userText.includes(title) || title.includes(userText) || 
							(typeof desc === 'string' && desc.includes(userText)));
				});
				if (matchedProducts.length === 0) {
					matchedProducts = db.products.slice(0, 3);
				} else {
					matchedProducts = matchedProducts.slice(0, 3);
				}

				let matchedActivities = db.activities.filter(a => {
					const title = a.ACTIVITY_TITLE || '';
					const desc = a.ACTIVITY_OBJ?.desc || '';
					let descText = '';
					if (typeof desc === 'string') descText = desc;
					else if (Array.isArray(desc)) descText = desc.map(d => d.val || '').join('');
					return (userText.includes(title) || title.includes(userText) || descText.includes(userText));
				});
				if (matchedActivities.length === 0) {
					matchedActivities = db.activities.slice(0, 3);
				} else {
					matchedActivities = matchedActivities.slice(0, 3);
				}

				// 2. 构造 System Context
				let context = '你是一个专门的厦门文旅助手。以下是当前文旅小程序中真实的景点与活动/行程项目列表数据：\n\n';
				
				context += '【景点项目】\n';
				matchedProducts.forEach(p => {
					const path = `/projects/culture/pages/product/detail/product_detail?id=${p._id}`;
					const desc = typeof p.PRODUCT_OBJ?.desc === 'string' ? p.PRODUCT_OBJ.desc : '';
					context += `- 景点名称：${p.PRODUCT_TITLE}\n  路径：${path}\n  简介：${desc.slice(0, 100)}\n`;
				});

				context += '\n【活动行程项目】\n';
				matchedActivities.forEach(a => {
					const path = `/projects/culture/pages/activity/detail/activity_detail?id=${a._id}`;
					let desc = '';
					if (typeof a.ACTIVITY_OBJ?.desc === 'string') desc = a.ACTIVITY_OBJ.desc;
					else if (Array.isArray(a.ACTIVITY_OBJ?.desc)) desc = a.ACTIVITY_OBJ.desc.map(d => d.val || '').join('');
					context += `- 行程活动名称：${a.ACTIVITY_TITLE}\n  路径：${path}\n  简介：${desc.slice(0, 100)}\n`;
				});

				context += '\n【重要回复规则】\n';
				context += '1. 当你在回答中推荐上述列表中的景点或活动行程时，必须使用特定的链接卡片格式 `[项目名称|小程序路径]` 进行输出。\n';
				context += '   例如：推荐鼓浪屿或胡里山炮台时，必须写成 `[胡里山炮台|/projects/culture/pages/product/detail/product_detail?id=xm-product-1]`。\n';
				context += '2. 请结合这些真实数据为用户规划行程或者解答疑问，回答要热情、亲切、字数精炼、有条理。\n';
				context += '3. 严禁杜撰不存在的小程序链接。如果推荐列表中没有的景点，可以直接提到名字，但千万不要加 `|路径`，更不要编造路径。\n\n';
				
				const prompt = `${context}用户提问：${userText}`;

				// 3. 对接 Nuwa-Cortex 抓取 token 并发起 WebSocket 对话
				const token = await fetchToken();
				const reply = await chatWithAi(token, prompt, params.chatId);
				return ok({ reply });
			} catch (err) {
				console.error('[AI Chat Error]', err);
				return fail('智能助手开小差啦，请稍后再试：' + err.message);
			}
		}

		case 'ai/summarize': {
			try {
				const title = params.title || '';
				const type = params.type || 'product';
				if (!title) {
					return ok({ summary: '' });
				}

				// 检查缓存
				const cacheKey = `summarize_${type}_${title}`;
				if (aiCache[cacheKey]) {
					return ok({ summary: aiCache[cacheKey] });
				}

				// 模糊检索景点或活动的详情描述作为上下文
				let itemDesc = '';
				if (type === 'product') {
					const prod = db.products.find(p => p.PRODUCT_TITLE === title);
					if (prod && prod.PRODUCT_OBJ && prod.PRODUCT_OBJ.desc) {
						itemDesc = prod.PRODUCT_OBJ.desc;
					}
				} else if (type === 'activity') {
					const act = db.activities.find(a => a.ACTIVITY_TITLE === title);
					if (act && act.ACTIVITY_OBJ && act.ACTIVITY_OBJ.desc) {
						if (typeof act.ACTIVITY_OBJ.desc === 'string') {
							itemDesc = act.ACTIVITY_OBJ.desc;
						} else if (Array.isArray(act.ACTIVITY_OBJ.desc)) {
							itemDesc = act.ACTIVITY_OBJ.desc.map(d => d.val || '').join('');
						}
					}
				} else if (type === 'info') {
					const inf = db.infos.find(i => i.INFO_OBJ && i.INFO_OBJ.title === title);
					if (inf && inf.INFO_OBJ && inf.INFO_OBJ.desc) {
						if (typeof inf.INFO_OBJ.desc === 'string') {
							itemDesc = inf.INFO_OBJ.desc;
						} else if (Array.isArray(inf.INFO_OBJ.desc)) {
							itemDesc = inf.INFO_OBJ.desc.map(d => d.val || '').join('');
						}
					}
				}

				// 如果没找到，兜底只用标题
				if (!itemDesc) {
					itemDesc = `${title}是厦门的一个知名文旅项目，包含丰富的游玩资源。`;
				}

				// 组装总结 Prompt
				const summaryPrompt = `你是一个资深的厦门文博旅游导游“阿鹭”。请根据以下${type === 'product' ? '景点' : '行程'}的介绍信息，提炼出【✨ 3大必游/必玩亮点】和【⚠️ 1条本地人防坑避堵贴士】。\n\n项目名称：${title}\n介绍：${itemDesc}\n\n【生成规则】：\n1. 请直接按亮点和贴士写两段，总字数必须控制在120字以内。\n2. 语气要热情专业。直接返回总结文字，千万不要说任何“以下是提炼”、“好的”等废话。`;

				const token = await fetchToken();
				const summaryText = await chatWithAi(token, summaryPrompt, 'ai-summary');

				// 存入缓存
				aiCache[cacheKey] = summaryText;

				return ok({ summary: summaryText });
			} catch (err) {
				console.error('[AI Summarize Error]', err);
				return ok({ summary: '智能导游阿鹭暂未总结此项目亮点，点击直接对话提问！' });
			}
		}

		case 'ai/today_recommend': {
			try {
				const cacheKey = `today_recommend_${new Date().toDateString()}`;
				if (aiCache[cacheKey]) {
					return ok({ recommend: aiCache[cacheKey] });
				}

				// 提取真实的几个景点名字
				const prodNames = db.products.slice(0, 5).map(p => p.PRODUCT_TITLE).join('、');

				const recommendPrompt = `你是一个非常亲切活泼的厦门专属 AI 导游“阿鹭”。今天是2026年5月29日，厦门多云、微风、气温约24℃。请从以下这几个真实的厦门景点中：[${prodNames}]，智能挑选最适宜今天游玩的2个景点，并以50字以内活泼可爱的语调写一段出游穿衣与防晒游玩金句推荐。\n\n【重要规则】：不要输出任何废话，直接输出推荐的话。必须包含今天推荐的景点名字。`;

				const token = await fetchToken();
				const recommendText = await chatWithAi(token, recommendPrompt, 'ai-recommend');

				aiCache[cacheKey] = recommendText;
				return ok({ recommend: recommendText });
			} catch (err) {
				console.error('[AI Today Recommend Error]', err);
				return ok({ recommend: '今天多云微风，温度适宜，适合去胡里山炮台听海涛，或者是环岛路骑行吹晚风哦。' });
			}
		}

		case 'product/list':
		case 'activity/list':
		case 'info/list':
		case 'info/my_list':
		case 'news/list':
		case 'comment/list':
		case 'activity/my_join_list':
		case 'fav/my_list':
			return ok(getRealList(route, params, token));

		case 'home/setup_get':
			return ok([
				{ type: 'text', val: '厦门旅行指南真后端已经成功在本地运行！' },
				{ type: 'text', val: '当前所有数据均已通过文件进行持久化，支持报名核销、评论和灵感管理。' }
			]);

		// #### 后台管理接口
		case 'admin/login':
			if (params.name && params.password && (params.name !== 'admin' || params.password !== '123456')) {
				return fail('管理员账号或密码错误');
			}
			return ok({
				token: 'admin-token',
				name: 'admin'
			});

		case 'admin/home': {
			return ok([
				{ title: '用户数', cnt: db.users.length },
				{ title: '公告', cnt: db.news.length },
				{ title: '行程', cnt: db.activities.length },
				{ title: '旅行灵感', cnt: db.infos.length },
				{ title: '景点', cnt: db.products.length }
			]);
		}

		case 'admin/log_clear': {
			db.logs = [];
			saveDb();
			return ok(true);
		}

		default: {
			// 后台管理通用增删改查
			if (route.startsWith('admin/')) {
				const match = route.match(/^admin\/([a-zA-Z0-9_]+)_(list|insert|edit|del|status|vouch|sort|detail|update_forms)$/);
				if (match) {
					const entity = match[1];
					const action = match[2];
					
					const entityMap = {
						news: 'news',
						product: 'products',
						activity: 'activities',
						info: 'infos',
						user: 'users',
						join: 'joins',
						mgr: 'mgrs',
						log: 'logs'
					};
					
					const dbKey = entityMap[entity];
					if (dbKey && db[dbKey]) {
						const list = db[dbKey];
						
						switch (action) {
							case 'list': {
								const filtered = list.filter(item => matchKeyword(item, params.search));
								const page = params.page || 1;
								const size = params.size || 20;
								return ok(pageList(filtered, page, size));
							}
							case 'detail': {
								const found = list.find(item => item._id === params.id);
								return ok(found || null);
							}
							case 'insert': {
								const id = `xm-${entity}-${Date.now()}`;
								const prefix = entity.toUpperCase();
								
								const newItem = {
									_id: id,
									...params,
									[`${prefix}_ADD_TIME`]: new Date().toISOString().slice(0, 19).replace('T', ' '),
									[`${prefix}_STATUS`]: 1,
									[`${prefix}_ORDER`]: 9999
								};

								if (params.forms && Array.isArray(params.forms)) {
									if (entity === 'product') {
										newItem.PRODUCT_TITLE = getFormVal(params.forms, '标题', '新增景点');
										const desc = getFormVal(params.forms, '简介', '景点简介');
										newItem.PRODUCT_OBJ = {
											cover: [params.pic || 'https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=600&fit=crop'],
											desc,
											content: [{ type: 'text', val: desc }]
										};
									} else if (entity === 'activity') {
										newItem.ACTIVITY_TITLE = getFormVal(params.forms, '标题', '新增活动');
										const desc = getFormVal(params.forms, '简介', '活动简介');
										newItem.ACTIVITY_OBJ = {
											cover: [params.pic || 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=600&fit=crop'],
											time: getFormVal(params.forms, '出发时间', '每周日 09:00'),
											fee: getFormVal(params.forms, '费用说明', '免费'),
											desc: [{ type: 'text', val: desc }]
										};
										newItem.ACTIVITY_MAX_CNT = Number(getFormVal(params.forms, '人数限制', '20'));
										newItem.ACTIVITY_JOIN_CNT = 0;
										newItem.ACTIVITY_JOIN_FORMS = [
											{ mark: 'name', type: 'text', title: '姓名', must: true, max: 30 },
											{ mark: 'phone', type: 'mobile', title: '手机', must: true }
										];
									} else if (entity === 'news') {
										newItem.NEWS_TITLE = getFormVal(params.forms, '标题', '新增公告');
										const desc = getFormVal(params.forms, '内容', '公告内容');
										newItem.NEWS_PIC = [params.pic || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&fit=crop'];
										newItem.NEWS_CONTENT = [{ type: 'text', val: desc }];
									}
								}

								list.unshift(newItem);
								saveDb();
								return ok({ id });
							}
							case 'edit': {
								const idx = list.findIndex(item => item._id === params.id || item._id === params._id);
								if (idx > -1) {
									const item = list[idx];
									Object.assign(item, params);
									
									if (params.forms && Array.isArray(params.forms)) {
										if (entity === 'product') {
											item.PRODUCT_TITLE = getFormVal(params.forms, '标题', item.PRODUCT_TITLE);
											const desc = getFormVal(params.forms, '简介', '景点简介');
											item.PRODUCT_OBJ = {
												cover: [params.pic || item.PRODUCT_OBJ?.cover?.[0]],
												desc,
												content: [{ type: 'text', val: desc }]
											};
										} else if (entity === 'activity') {
											item.ACTIVITY_TITLE = getFormVal(params.forms, '标题', item.ACTIVITY_TITLE);
											const desc = getFormVal(params.forms, '简介', '活动简介');
											item.ACTIVITY_OBJ = {
												cover: [params.pic || item.ACTIVITY_OBJ?.cover?.[0]],
												time: getFormVal(params.forms, '出发时间', item.ACTIVITY_OBJ?.time),
												fee: getFormVal(params.forms, '费用说明', item.ACTIVITY_OBJ?.fee),
												desc: [{ type: 'text', val: desc }]
											};
											item.ACTIVITY_MAX_CNT = Number(getFormVal(params.forms, '人数限制', String(item.ACTIVITY_MAX_CNT || 20)));
										} else if (entity === 'news') {
											item.NEWS_TITLE = getFormVal(params.forms, '标题', item.NEWS_TITLE);
											const desc = getFormVal(params.forms, '内容', '公告内容');
											item.NEWS_PIC = [params.pic || item.NEWS_PIC?.[0]];
											item.NEWS_CONTENT = [{ type: 'text', val: desc }];
										}
									}

									saveDb();
									return ok(true);
								}
								return fail('编辑的对象不存在');
							}
							case 'del': {
								const idx = list.findIndex(item => item._id === params.id);
								if (idx > -1) {
									list.splice(idx, 1);
									saveDb();
								}
								return ok(true);
							}
							case 'status': {
								const found = list.find(item => item._id === params.id);
								if (found) {
									const prefix = entity.toUpperCase();
									found[`${prefix}_STATUS`] = Number(params.status);
									saveDb();
								}
								return ok(true);
							}
							case 'vouch': {
								const found = list.find(item => item._id === params.id);
								if (found) {
									const prefix = entity.toUpperCase();
									found[`${prefix}_VOUCH`] = Number(params.vouch);
									saveDb();
								}
								return ok(true);
							}
							case 'sort': {
								const found = list.find(item => item._id === params.id);
								if (found) {
									const prefix = entity.toUpperCase();
									found[`${prefix}_ORDER`] = Number(params.sort || params.order);
									saveDb();
								}
								return ok(true);
							}
							case 'update_forms': {
								const found = list.find(item => item._id === params.id);
								if (found) {
									const prefix = entity.toUpperCase();
									found[`${prefix}_JOIN_FORMS`] = params.hasImageForms || params.forms || [];
									saveDb();
								}
								return ok(true);
							}
						}
					}
				}

				// #### 报名名单与用户导出
				if (route === 'admin/activity_join_data_export') {
					const activityId = params.activityId;
					const joinsList = db.joins.filter(j => j.ACTIVITY_JOIN_ACTIVITY_ID === activityId);
					
					let csv = '\uFEFF';
					csv += '报名ID,报名时间,姓名,手机,签到状态\n';
					joinsList.forEach(j => {
						const name = getFormVal(j.ACTIVITY_JOIN_FORMS, '姓名', '未填');
						const phone = getFormVal(j.ACTIVITY_JOIN_FORMS, '手机', '未填');
						const check = j.ACTIVITY_JOIN_IS_CHECKIN === 1 ? '已签到' : '未签到';
						csv += `"${j._id}","${j.ACTIVITY_JOIN_ADD_TIME}","${name}","${phone}","${check}"\n`;
					});

					const filepath = path.join(EXPORT_DIR, `join_data_${activityId}.csv`);
					fs.writeFileSync(filepath, csv, 'utf8');

					const activity = db.activities.find(a => a._id === activityId);
					if (activity) {
						activity.EXPORT_URL = `http://${host}/export/join_data_${activityId}.csv`;
						saveDb();
					}

					return ok({
						url: `http://${host}/export/join_data_${activityId}.csv`,
						total: joinsList.length
					});
				}

				if (route === 'admin/activity_join_data_get') {
					const activityId = params.activityId || (db.joins[0]?.ACTIVITY_JOIN_ACTIVITY_ID);
					const activity = db.activities.find(a => a._id === activityId);
					return ok({
						url: activity?.EXPORT_URL || ''
					});
				}

				if (route === 'admin/activity_join_data_del') {
					return ok(true);
				}

				if (route === 'admin/user_data_export') {
					let csv = '\uFEFF';
					csv += '用户ID,注册时间,微信昵称,手机号\n';
					db.users.forEach(u => {
						csv += `"${u._id}","${u.USER_ADD_TIME}","${u.USER_NAME}","${u.USER_MOBILE}"\n`;
					});

					const filepath = path.join(EXPORT_DIR, `user_data.csv`);
					fs.writeFileSync(filepath, csv, 'utf8');
					return ok({
						url: `http://${host}/export/user_data.csv`,
						total: db.users.length
					});
				}

				if (route === 'admin/user_data_get') {
					return ok({
						url: `http://${host}/export/user_data.csv`
					});
				}

				if (route === 'admin/user_data_del') {
					return ok(true);
				}

				// 后台核销签到
				if (route === 'admin/activity_join_checkin' || route === 'admin/activity_join_scan') {
					const id = params.id || params.activityJoinId || params.code;
					const join = db.joins.find(j => j._id === id || j.ACTIVITY_JOIN_CODE === id);
					if (join) {
						join.ACTIVITY_JOIN_IS_CHECKIN = 1;
						join.ACTIVITY_JOIN_CHECKIN_TIME = new Date().toISOString().slice(0, 19).replace('T', ' ');
						saveDb();
						return ok(true);
					}
					return fail('找不到该报名记录');
				}

				if (route === 'admin/activity_cancel_join_all') {
					const activityId = params.activityId;
					db.joins = db.joins.filter(j => j.ACTIVITY_JOIN_ACTIVITY_ID !== activityId);
					const activity = db.activities.find(a => a._id === activityId);
					if (activity) {
						activity.ACTIVITY_JOIN_CNT = 0;
					}
					saveDb();
					return ok(true);
				}

				if (route === 'admin/activity_join_status') {
					const id = params.id;
					const status = Number(params.status);
					const join = db.joins.find(j => j._id === id);
					if (join) {
						join.ACTIVITY_JOIN_STATUS = status;
						saveDb();
					}
					return ok(true);
				}
			}

			// 降级兜底返回 local mock
			try {
				const localRouteData = require('../miniprogram/projects/culture/public/local_demo_data.js');
				return ok(localRouteData.getRouteData(route, params));
			} catch (e) {
				return ok({});
			}
		}
	}
}

// AI 助手对接 Nuwa-Cortex 远程服务的辅助函数
function fetchToken() {
	return new Promise((resolve, reject) => {
		const http = require('http');
		http.get('http://115.190.164.187:8766/webui/bootstrap', (res) => {
			if (res.statusCode !== 200) {
				reject(new Error(`Bootstrap HTTP status ${res.statusCode}`));
				return;
			}
			let rawData = '';
			res.on('data', (chunk) => { rawData += chunk; });
			res.on('end', () => {
				try {
					const parsedData = JSON.parse(rawData);
					resolve(parsedData.token);
				} catch (e) {
					reject(e);
				}
			});
		}).on('error', reject);
	});
}

function chatWithAi(token, prompt, chatId) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`ws://115.190.164.187:8766/?token=${token}`);
		let replyText = '';
		let hasError = false;

		const timer = setTimeout(() => {
			if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
				ws.close();
				reject(new Error('AI response timeout'));
			}
		}, 30000);

		ws.on('open', () => {
			// 连接建立，等待 ready 帧
		});

		ws.on('message', (data) => {
			try {
				const msg = JSON.parse(data.toString('utf8'));
				if (msg.event === 'ready') {
					ws.send(JSON.stringify({
						type: 'message',
						chat_id: chatId || 'miniprogram-chat',
						content: prompt,
						persona: 'xiamen-guide'
					}));
				} else if (msg.event === 'delta') {
					if (msg.text) {
						replyText += msg.text;
					}
				} else if (msg.event === 'turn_end') {
					clearTimeout(timer);
					ws.close();
					resolve(replyText);
				}
			} catch (e) {
				// 忽略控制消息
			}
		});

		ws.on('error', (err) => {
			hasError = true;
			clearTimeout(timer);
			reject(err);
		});

		ws.on('close', () => {
			clearTimeout(timer);
			if (!hasError) {
				resolve(replyText);
			}
		});
	});
}

async function handleRequest(req, res) {
	const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

	if (req.method === 'OPTIONS') {
		sendJson(res, 200, ok(true));
		return;
	}

	if (req.method === 'GET' && url.pathname === '/health') {
		sendJson(res, 200, ok({ status: 'ok', service: 'xiamen-travel-api' }));
		return;
	}

	// 静态导出文件服务
	if (req.method === 'GET' && url.pathname.startsWith('/export/')) {
		const filename = path.basename(url.pathname);
		const filepath = path.join(EXPORT_DIR, filename);
		if (fs.existsSync(filepath) && fs.statSync(filepath).isFile()) {
			res.writeHead(200, {
				'Content-Type': 'application/octet-stream; charset=utf-8',
				'Access-Control-Allow-Origin': '*',
				'Content-Disposition': `attachment; filename=${encodeURIComponent(filename)}`
			});
			fs.createReadStream(filepath).pipe(res);
			return;
		} else {
			sendJson(res, 404, fail('File not found', CODE.DATA));
			return;
		}
	}

	// 静态图片和文件服务，支持强缓存
	if (req.method === 'GET' && url.pathname.startsWith('/public/')) {
		const relativePath = url.pathname.replace(/^\/public\//, '');
		const filepath = path.join(__dirname, 'public', relativePath);
		const baseDir = path.join(__dirname, 'public');
		console.log(`[Static File Debug] path: ${url.pathname}, filepath: ${filepath}, exists: ${fs.existsSync(filepath)}, startsWith: ${filepath.startsWith(baseDir)}`);
		if (filepath.startsWith(baseDir) && fs.existsSync(filepath) && fs.statSync(filepath).isFile()) {
			let mimeType = 'application/octet-stream';
			if (filepath.endsWith('.jpg') || filepath.endsWith('.jpeg')) mimeType = 'image/jpeg';
			else if (filepath.endsWith('.png')) mimeType = 'image/png';
			else if (filepath.endsWith('.gif')) mimeType = 'image/gif';
			
			res.writeHead(200, {
				'Content-Type': mimeType,
				'Access-Control-Allow-Origin': '*',
				'Cache-Control': 'public, max-age=31536000',
				'Connection': 'close'
			});
			fs.createReadStream(filepath).pipe(res);
			return;
		} else {
			sendJson(res, 404, fail('File not found', CODE.DATA));
			return;
		}
	}

	// 文件上传接口
	if (req.method === 'POST' && url.pathname === '/api/upload') {
		handleUpload(req, res);
		return;
	}

	if (req.method !== 'POST' || url.pathname !== '/api/miniprogram') {
		sendJson(res, 404, fail('Not found', CODE.DATA));
		return;
	}

	try {
		const body = await readBody(req);
		const route = body.route;
		const params = body.params || {};
		const token = body.token || '';

		console.log(`[API Request] route: ${route}, token: ${token}`);

		if (!route) {
			sendJson(res, 400, fail('缺少 route', CODE.DATA));
			return;
		}

		const startTime = Date.now();
		const host = req.headers.host || '127.0.0.1:3000';
		const result = await handleRoute(route, params, token, host);
		console.log(`[API Response] route: ${route}, cost: ${Date.now() - startTime}ms`);

		sendJson(res, 200, result, req);
	} catch (err) {
		console.error(err);
		sendJson(res, 500, fail(err.message || 'Server error', CODE.SVR), req);
	}
}

const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
	console.log(`Xiamen travel API listening on http://${HOST}:${PORT}`);
	console.log('POST /api/miniprogram with { route, token, PID, params }');
});
