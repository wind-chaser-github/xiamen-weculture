## 功能介绍 

 ![image](https://github.com/user-attachments/assets/4ff0ef8e-3370-462c-82d1-bea8aa734575)

厦门旅行指南:全方位的旅游服务平台，涵盖行程报名、景点介绍、景点指南以及旅行灵感分享等功能，满足用户在厦门旅行过程中的多种需求，提升旅游体验，同时助力厦门旅游发展。

- 行程报名：分类呈现各类城市漫游、海岛路线、亲子研学、美食体验等，每项行程展示名称、时间、集合地点、行程亮点、参与人数上限以及报名截止日期等关键信息，并配以封面图片，方便用户快速了解行程概况；点击后进入报名表单填写页面，用户填写完成后可提交报名。
- 景点指南：将景点按照不同类型进行分类，用户可通过分类导航快速进入相应类别页面浏览景点。
- 我的旅行灵感：展示用户发布的精彩的旅行灵感案例，用户也可以自行发布自己的旅行灵感。
- 本项目前后端完整代码包括出行提示、景点指南、发布灵感、行程报名、签到核销，管理者可以自定义报名要填写的内容，比如姓名、性别、年龄等，后台行程管理，后台报名名单管理和导出Excel，后台管理最新通知公告。

![image](https://github.com/user-attachments/assets/f3be03dd-715d-4a98-83fd-0afebc59b555)

## 技术运用
- 本项目使用微信小程序平台进行开发。
- 使用腾讯专门的小程序云开发技术，云资源包含云函数，数据库，带宽，存储空间，定时器等，资源配额价格低廉，无需域名和服务器即可搭建。
- 小程序本身的即用即走，适合小工具的使用场景，也适合快速开发迭代。
- 云开发技术采用腾讯内部链路，没有被黑客攻击的风险，不会 DDOS攻击，节省防火墙费用，安全性高且免维护。
- 资源承载力可根据业务发展需要随时弹性扩展。  

 

## 演示 
 ![image](https://github.com/user-attachments/assets/cf48d9d8-f9a9-4396-a426-8eeba658cf07)


## 安装

- 安装手册见源码包里的word文档 

## 本地后端

本项目原始后端是 `cloudfunctions/mcloud` 下的 Node.js 微信云函数。当前已补充一个可部署到自有服务器的轻量 HTTP 后端，目录为 `backend/`。

本地启动：

```bash
cd backend
npm start
```

默认监听：

```text
http://127.0.0.1:3000
```

小程序切换到自有服务器接口：

```js
// miniprogram/setting/setting.js
BACKEND_MODE: 'http',
API_BASE_URL: 'http://127.0.0.1:3000'
```

接口统一入口：

```text
POST /api/miniprogram
```

请求体：

```json
{
  "route": "home/list",
  "token": "",
  "PID": "culture",
  "params": {}
}
```

返回格式：

```json
{
  "code": 200,
  "data": {}
}
```



## 截图

![image](https://github.com/user-attachments/assets/3a15cfad-ff70-423a-9aa4-d4cc96541e17)
![image](https://github.com/user-attachments/assets/d68b14b6-dfb4-440e-b4c4-70ea8f44afb1)
![image](https://github.com/user-attachments/assets/431f4ae8-1507-4324-987e-2dc8f99780c2)

![image](https://github.com/user-attachments/assets/df405f24-d214-4baa-82cd-3c045864626a)

![image](https://github.com/user-attachments/assets/87906d41-c060-4856-a05c-d44f13065bc0)

![image](https://github.com/user-attachments/assets/0126e8d2-e030-4a3b-ab44-df35cab07719)

![image](https://github.com/user-attachments/assets/34fc3ad7-9140-4055-9639-69363a8fc50a)
![image](https://github.com/user-attachments/assets/26a63b16-b6aa-4b42-b084-75ce1b819850)
![image](https://github.com/user-attachments/assets/483a1fd7-5b39-4766-a07a-bab5b8e17839)

 ![image](https://github.com/user-attachments/assets/0812c73b-1ef3-40c0-9dc7-f75063d506ca)
![image](https://github.com/user-attachments/assets/773bf5fd-822f-4974-b6c4-e449509b69c7)


## 后台管理系统截图 
- 后台超级管理员默认账号:admin，密码123456，请登录后台后及时修改密码和创建普通管理员。

![image](https://github.com/user-attachments/assets/a8e7faee-54cc-4efb-b54e-652bd50c3dc0)

![image](https://github.com/user-attachments/assets/3fa084a0-a8f6-43f5-9bc0-ffd4f24f7434)

![image](https://github.com/user-attachments/assets/7802c833-2aa7-4a78-9e7f-32893774804d)


![image](https://github.com/user-attachments/assets/cf5bf878-f389-4dc4-bf02-147ee79e4a09)
![image](https://github.com/user-attachments/assets/b897f6b8-234e-4255-aa4c-8386d6d22aa5)



![image](https://github.com/user-attachments/assets/72190543-3dc7-40ad-820d-5f2649ebac72)

![image](https://github.com/user-attachments/assets/ee25ed57-f1c3-454a-ba8b-bfba8ef4e854)

![image](https://github.com/user-attachments/assets/47186985-3445-4e87-8192-db3964240191)


![image](https://github.com/user-attachments/assets/52d8ff16-ff6a-432d-b04f-86cb8807e6be)
![image](https://github.com/user-attachments/assets/f1d85494-26db-419b-bb6f-253b946631a8)
![image](https://github.com/user-attachments/assets/583b6ac0-3fa6-41df-b53a-8b6d524b4875)
