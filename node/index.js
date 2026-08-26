const routes = require('./routes');
const Cache = require('../util/cache');
const Request = require('../util/request');

const cache = new Cache();

const blackFunc = new Set([
  'user/cookie',
  'user/getCookie',
  'user/setCookie',
])

class QQMusic {
  get cookie() {
    return this._cookie || {};
  }

  get uin() {
    return this.cookie.uin;
  }

  setCookie(cookies) {
    switch (typeof cookies) {
      case 'string': {
        const cookieObj = {};
        cookies.split('; ').forEach((c) => {
          const arr = c.split('=');
          cookieObj[arr[0]] = arr[1];
        });

        if (Number(cookieObj.login_type) === 2) {
          cookieObj.uin = cookieObj.wxuin;
        }
        cookieObj.uin = (cookieObj.uin || '').replace(/\D/g, '');
        this._cookie = cookieObj;
        break;
      }
      case 'object':
        this._cookie = cookies;
        break;
    }
  }

  api = (path, query = {}) => {
    return new Promise((resolve, reject) => {
      const truePath = path.replace(/^\/|\/$/g, '').split('/');
      const baseFunc = truePath.shift();
      const func = truePath.join('/') || '';
      const req = {
        query: {...query, ownCookie: 1},
        cookies: this.cookie,
      };
      const res = {
        send: ({result, data, errMsg}) => {
          if (result === 100) {
            resolve(data);
          } else {
            reject({message: errMsg});
          }
        },
        redirect: (url) => url,
        cookie: (k, val) => this.setCookie({...this.cookie, [k]: val}),
      };

      if (!routes[baseFunc] || !routes[baseFunc][`/${func}`] || blackFunc.has(`${baseFunc}/${func}`)) {
        return reject({message: 'wrong path'});
      }

      try {
        routes[baseFunc][`/${func}`]({
          req,
          res,
          request: Request(req, res),
          cache,
          globalCookie: {
            userCookie: () => this.cookie,
          }
        })
      } catch (err) {
        reject(err);
      }
    })
  }
}

const app = require('express')();
const qqMusic = new QQMusic();

// 跨域中间件（万能胶水）
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 根路径返回小手机App喜欢的 { code: 200 }
app.get('/', (req, res) => {
  res.json({ code: 200 });
});

// 搜索接口：自动将 keyword 转为 key
app.get('/search', async (req, res) => {
  try {
    if (req.query.keyword) {
      req.query.key = req.query.keyword;
    }
    const result = await qqMusic.api('search', req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 其他所有路径：如果是未知路径，也返回 200（防止App测试报错）
app.get('*', async (req, res) => {
  try {
    const path = req.path.replace(/^\//, '');
    if (!path) return res.json({ code: 200 });
    const result = await qqMusic.api(path, req.query);
    res.json(result);
  } catch (err) {
    if (err.message === 'wrong path') {
      return res.json({ code: 200 });
    }
    res.status(500).json({ error: err.message });
  }
});

// 额外支持 POST 请求（某些App测试用POST）
app.post('*', (req, res) => {
  res.json({ code: 200 });
});

module.exports = app;