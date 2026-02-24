/**
 * Cloudflare Worker - Imgbb 聚合图床旗舰版(v2.4)
  * 特性：增加批量上传支持、高斯毛玻璃全屏登录弹窗、全本地化相册画廊
    */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ==========================================
    // 环境参数检查 (IMGBB_API_KEY)
    // ==========================================
    const apiKey = env.IMGBB_API_KEY;
    if (!apiKey) {
      return new Response(
        "系统未配置 IMGBB_API_KEY 环境变量，请前往 Cloudflare 面板添加！",
        { status: 500 },
      );
    }

    // 可选：管理密码（不配密码则所有人全览并可乱传图）
    const adminPassword = env.ADMIN_PASSWORD || "";

    // ==========================================
    // 路由：首页 (附带独立登录验证架构)
    // ==========================================
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(generateHTML(adminPassword !== ""), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // ==========================================
    // API：登录验证 (POST /auth)
    // 此端点前端只用于探活验证密码对不对
    // ==========================================
    if (url.pathname === "/auth" && request.method === "POST") {
      const fd = await request.formData();
      const pwd = fd.get("password") || "";
      if (adminPassword && pwd !== adminPassword) {
        return new Response(JSON.stringify({ success: false }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ==========================================
    // API：接收文件直传 Imgbb (POST /upload)
    // ==========================================
    if (url.pathname === "/upload" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file");
        const inputPassword = formData.get("password") || "";

        // 双向鉴权保障：传图片必须过管理密码墙
        if (adminPassword && inputPassword !== adminPassword) {
          return new Response(
            JSON.stringify({
              error: "由于您的终端会话未通过密码验证，请求被阻断。",
            }),
            { status: 403 },
          );
        }

        if (!file || !(file instanceof File)) {
          return new Response(JSON.stringify({ error: "文件无效或未上传" }), {
            status: 400,
          });
        }
        if (file.size > 32 * 1024 * 1024) {
          return new Response(
            JSON.stringify({ error: "图片过巨，最高承受 32MB！" }),
            { status: 400 },
          );
        }

        const imgbbUrl = `https://api.imgbb.com/1/upload?key=${apiKey}`;
        const uploadData = new FormData();
        uploadData.append("image", file);

        const response = await fetch(imgbbUrl, {
          method: "POST",
          body: uploadData,
        });
        const result = await response.json();

        if (result.success) {
          return new Response(
            JSON.stringify({
              success: true,
              url: result.data.url,
              thumb_url: result.data.thumb.url,
              delete_url: result.data.delete_url,
              filename: result.data.title || file.name,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        } else {
          return new Response(
            JSON.stringify({
              error: "上游图床拒绝分发",
              detail: result.error.message,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      } catch (e) {
        return new Response(
          JSON.stringify({ error: `传输进程中断: ${e.message}` }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    return new Response("404 不可达的空洞", { status: 404 });
  },
};

// =====================================
// 带“流光毛玻璃弹窗锁定”特效的前端系统
// =====================================
function generateHTML(requiresPassword) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>聚合私有图床管理系统</title>
  <style>
    :root {
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --bg: #f8fafc;
      --card-bg: rgba(255, 255, 255, 0.75);
      --text: #1e293b;
      --text-light: #64748b;
      --border: #e2e8f0;
      --success: #10b981;
      --danger: #ef4444;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      /* 梦幻动态流光背景 */
      background: linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab);
      background-size: 400% 400%;
      animation: gradientBG 15s ease infinite;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
      color: var(--text);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      position: relative;
    }
    @keyframes gradientBG {
      0% {background-position: 0% 50%;}
      50% {background-position: 100% 50%;}
      100% {background-position: 0% 50%;}
    }

    /* 
      1. 全屏解锁弹层 
      (只在 requiresPassword 为真时初始开启)
    */
    #loginModalOverlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(25px); /* 高斯毛玻璃关键 */
      -webkit-backdrop-filter: blur(25px);
      display: ${requiresPassword ? "flex" : "none"};
      align-items: center;
      justify-content: center;
      z-index: 9999;
      opacity: 1;
      transition: opacity 0.4s ease;
    }
    .login-box {
      background: rgba(255, 255, 255, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.6);
      border-radius: 20px;
      padding: 40px;
      width: 90%;
      max-width: 380px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.3);
      transform: translateY(0);
      transition: transform 0.4s ease;
    }
    .login-box.hide { transform: translateY(-30px) scale(0.95); opacity: 0;}
    
    .login-icon { font-size: 54px; margin-bottom: 20px; text-shadow: 0 4px 10px rgba(0,0,0,0.1); display: inline-block;}
    .login-box h2 { margin: 0 0 10px; color: #111; font-weight: 700; font-size: 24px;}
    .login-box p { font-size: 14px; color: #555; margin-bottom: 30px;}
    
    .pwd-input-wrapper {
      position: relative; margin-bottom: 20px;
    }
    .pwd-input-wrapper input {
      width: 100%; box-sizing: border-box; padding: 15px 15px 15px 45px;
      border-radius: 12px; border: 2px solid transparent;
      background: rgba(255,255,255,0.9); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05) inset;
      font-size: 16px; outline: none; transition: all 0.2s;
    }
    .pwd-input-wrapper input:focus { border-color: var(--primary); background: #fff;}
    .pwd-input-wrapper::before { content: '🔒'; position: absolute; left: 15px; top: 50%; transform: translateY(-50%); opacity: 0.6;}
    
    .login-btn {
      background: var(--primary); color: white; border: none; padding: 14px;
      width: 100%; border-radius: 12px; font-size: 16px; font-weight: 600;
      cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(99,102,241,0.4);
    }
    .login-btn:hover { background: var(--primary-hover); transform: translateY(-2px); box-shadow: 0 6px 15px rgba(99,102,241,0.5);}
    
    #loginError { color: var(--danger); font-size: 13px; margin-top: 15px; display: none; font-weight: 500;}


    /* 
      2. 系统主体面板 (解锁后呈现的内容，或者不需要密码直接呈现) 
    */
    .wrapper {
      width: 100%; max-width: 900px;
      display: flex; flex-direction: column; gap: 30px;
      opacity: ${requiresPassword ? "0" : "1"};
      transform: ${requiresPassword ? "scale(0.98)" : "scale(1)"};
      filter: ${requiresPassword ? "blur(10px)" : "none"};
      transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1); /* 配合弹窗消失时的平滑浮现 */
    }

    /* 内部玻璃卡片公用 */
    .card {
      background: rgba(255, 255, 255, 0.88);
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      padding: 35px; border-radius: 24px;
      box-shadow: 0 10px 40px -10px rgba(0,0,0,0.15);
      border: 1px solid rgba(255,255,255,0.7);
    }

    .header { text-align: center; margin-bottom: 25px; }
    .header h2 { margin: 0 0 8px 0; font-size: 26px; font-weight: 800; color: #111827; letter-spacing: -0.5px;}
    .header p { margin: 0; color: var(--text-light); font-size: 14px; }

    /* 上传感应区 */
    .upload-area {
      border: 2px dashed rgba(99,102,241,0.4); border-radius: 20px;
      padding: 50px 20px; text-align: center; cursor: pointer;
      transition: all 0.3s ease; background: rgba(255,255,255,0.6);
      position: relative;
    }
    .upload-area:hover, .upload-area.dragover { border-color: var(--primary); background: rgba(99,102,241,0.08); }
    .upload-area input[type=file] { position: absolute; width:1px; height:1px; opacity:0; }
    .upload-icon { font-size: 48px; margin-bottom: 12px; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.15)); }
    .upload-text { font-weight: 600; margin-bottom: 6px; color:#334155;}
    
    #loading { display: none; text-align: center; margin-top: 20px; color: var(--primary); font-weight: 600; }
    
    /* 结果面板 */
    #resultBox { display: none; margin-top: 30px; animation: fadeIn 0.5s ease; text-align: center;}
    @keyframes fadeIn { from{opacity:0; transform:translateY(15px)} to{opacity:1; transform:translateY(0)} }
    
    .success-badge { display: inline-block; background: #D1FAE5; color: #065F46; padding: 8px 20px; border-radius: 30px; font-size: 14px; font-weight: 600; margin-bottom: 25px; box-shadow: 0 4px 6px rgba(16,185,129,0.1);}
    
    .preview-container { 
      position: relative; border-radius: 16px; overflow: hidden; border: 1px solid var(--border); 
      cursor: pointer; max-width:400px; margin: 0 auto 25px auto;
      box-shadow: 0 8px 20px rgba(0,0,0,0.1);
    }
    .preview-container img { width: 100%; display: block; }
    .click-hint { position: absolute; inset:0; background:rgba(0,0,0,0.6); color:#fff; display:flex; justify-content:center; align-items:center; opacity:0; transition:opacity 0.2s; font-weight:600; font-size:15px;}
    .preview-container:hover .click-hint { opacity: 1; backdrop-filter: blur(2px);}

    /* 多代码面板 */
    .codes-panel { display: none; background: rgba(255,255,255,0.9); border: 1px solid var(--border); border-radius: 16px; padding: 25px; text-align: left; }
    .code-group { margin-bottom: 18px; }
    .code-group label { display: block; font-size: 12px; color: var(--text-light); text-transform: uppercase; margin-bottom: 8px; font-weight: 700; letter-spacing:0.5px;}
    .input-wrapper { display: flex; align-items: center; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background:#FAFAFA;}
    .input-wrapper input { flex-grow: 1; border: none; background: transparent; padding: 12px; font-family: ui-monospace, monospace; font-size: 13px; outline: none; }
    .copy-btn { background: #E2E8F0; border: none; padding: 12px 18px; cursor: pointer; color: var(--text); font-weight: 600; font-size: 13px; transition:0.2s;}
    .copy-btn:hover { background: #CBD5E1; }

    /* =================画廊后台区域================= */
    .gallery-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid var(--border); padding-bottom: 15px;}
    .gallery-header h3 { margin: 0; font-size: 20px; color: #111827; font-weight:700;}
    .btn-clear { background: rgba(239,68,68,0.1); color: var(--danger); border: 1px solid rgba(239,68,68,0.2); padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight:600; transition: 0.2s;}
    .btn-clear:hover { background: var(--danger); color: #fff; }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 18px; margin-top: 20px; }
    
    .grid-item {
      position: relative; background: #fff; border-radius: 14px; overflow: hidden; border: 1px solid var(--border);
      box-shadow: 0 4px 10px rgba(0,0,0,0.04); transition: transform 0.2s, box-shadow 0.2s;
    }
    .grid-item:hover { transform: translateY(-4px); box-shadow: 0 10px 25px rgba(0,0,0,0.12); }
    
    .grid-img { width: 100%; height: 140px; object-fit: cover; display: block; cursor: pointer; }
    
    .grid-toolbar { display: flex; justify-content: space-between; padding: 10px; background: rgba(248,250,252,0.8); border-top: 1px solid var(--border); }
    .grid-btn { background: transparent; border: none; font-size: 13px; font-weight:600; cursor: pointer; color: var(--text-light); padding: 5px 8px; border-radius: 6px; transition:0.2s;}
    .grid-btn:hover { background: #E2E8F0; color: var(--text); }
    .btn-delete { color: var(--danger); }
    .btn-delete:hover { background: #FEE2E2; color: var(--danger); }
    
    .empty-state { text-align: center; color: #9CA3AF; padding: 50px 0; font-size: 15px; font-weight:500;}
    .sys-notice { font-size: 12px; color: #64748B; background:rgba(255,255,255,0.4); padding:15px; border-radius:8px; line-height:1.6;}
  </style>
</head>
<body>

  <!-- =============================== -->
  <!-- 登录拦截弹窗 (带毛玻璃锁屏)   -->
  <!-- =============================== -->
  <div id="loginModalOverlay">
    <div class="login-box" id="loginBoxDiv">
      <div class="login-icon">🗝️</div>
      <h2>图库管理鉴权</h2>
      <p>检测到图库已上锁，请验明正身以开启空间</p>
      
      <div class="pwd-input-wrapper">
        <input type="password" id="modalPwd" placeholder="在此键入私有安全口令..." autocomplete="current-password" onkeypress="if(event.key==='Enter') verifyAndUnlock()">
      </div>
      
      <button class="login-btn" onclick="verifyAndUnlock()" id="loginBtnTxt">解锁进入系统</button>
      <div id="loginError">⚠️ 口令指纹不匹配，拒绝授予访问权限</div>
    </div>
  </div>


  <!-- =============================== -->
  <!-- 被保护的图床核心业务主板        -->
  <!-- =============================== -->
  <div class="wrapper" id="appMainSys">
    <!-- 模块 1：上传控制台 -->
    <div class="card">
      <div class="header">
        <h2>🚀 私人图床中心</h2>
        <p>支持批量上传 · 单文件至多 32MB · 本地无痕记忆体</p>
      </div>

      <div class="upload-area" id="uploadArea" onclick="document.getElementById('fileInput').click()">
        <div class="upload-icon">📸</div>
        <div class="upload-text">击打此处或将单/多张图档抛洒于此（亦挺 Ctrl+V 直传）</div>
        <input type="file" id="fileInput" accept="image/*" multiple>
      </div>

      <div id="loading">✨ 相片极速装载中，稍作须臾...</div>

      <div id="resultBox">
        <div class="success-badge" id="resultBadge">✅ 画迹已被镌刻！现已收存至下方私密展示廊。</div>
        <div class="preview-container" id="previewContainer">
          <img id="previewImg" src="">
          <div class="click-hint">📄 轻击以展露/隐藏全部可用代码</div>
        </div>

        <div class="codes-panel" id="codesPanel">
          <div class="code-group">
            <label>🌐 直击链接 (URL)</label>
            <div class="input-wrapper">
              <input type="text" id="urlDirect" readonly>
              <button class="copy-btn" onclick="copyEl('urlDirect')">采撷</button>
            </div>
          </div>
          <div class="code-group">
            <label>📝 Markdown 书写用</label>
            <div class="input-wrapper">
              <input type="text" id="urlMd" readonly>
              <button class="copy-btn" onclick="copyEl('urlMd')">采撷</button>
            </div>
          </div>
          <div class="code-group">
            <label>💻 HTML 程式签</label>
            <div class="input-wrapper">
              <input type="text" id="urlHtml" readonly>
              <button class="copy-btn" onclick="copyEl('urlHtml')">采撷</button>
            </div>
          </div>
          <div class="code-group">
            <label>🏷️ 论坛代码 (BBCODE)</label>
            <div class="input-wrapper">
              <input type="text" id="urlBb" readonly>
              <button class="copy-btn" onclick="copyEl('urlBb')">采撷</button>
            </div>
          </div>
        </div>

        <div style="text-align:center; margin-top:25px;">
           <button class="login-btn" style="width:auto; padding:12px 30px;" onclick="resetToUpload()">⬆️ 携原格式返回上传中心</button>
        </div>
      </div>
    </div>

    <!-- 模块 2：本地相册画廊后台 -->
    <div class="card">
      <div class="gallery-header">
        <h3>🖼️ 过往上传影记册</h3>
        <button class="btn-clear" onclick="clearAllRecords()">擦除此台仪器的全部记忆</button>
      </div>
      <div class="sys-notice">
        <b>💡 架构设计披露:</b> 由于远端的接口设计理念缺失对相册逆向解析的反调机制，故此这方印刻所有珍摄之库房仅依靠此部浏览器端之本地存储容器构设。切记：换阅装置将无可逆转地遗失下述缩影。
      </div>
      
      <div id="galleryGrid" class="grid">
        <!-- JS 动态注入历史图片 -->
      </div>
    </div>
  </div>


  <script>
    // ===================================
    // 弹窗鉴权解锁逻辑与动画体系
    // ===================================
    const sysStateRequiresAuth = ${requiresPassword ? "true" : "false"};
    const authOverlay = document.getElementById('loginModalOverlay');
    const authBox = document.getElementById('loginBoxDiv');
    const appWrapper = document.getElementById('appMainSys');
    const btnTxt = document.getElementById('loginBtnTxt');
    
    // 全局保存这把解锁钥匙，供上传图片时放行用
    let CURRENT_UNLOCKED_PWD = ''; 

    // 如果未加密，系统自动直接放行，消除弹窗阴影
    if(!sysStateRequiresAuth) {
        unlockAppInterface();
    }

    async function verifyAndUnlock() {
        const p = document.getElementById('modalPwd').value;
        if (!p) {
           flashError(); return;
        }

        btnTxt.innerText = "校验指纹中...";
        
        // 我们利用 formdata 去戳 Worker 请求一次身份实名
        const fd = new FormData(); fd.append('password', p);
        try {
           const res = await fetch('/auth', { method: 'POST', body: fd });
           if(res.ok) {
              // 密码对！开启系统大门！
              CURRENT_UNLOCKED_PWD = p; 
              authOverlay.style.opacity = '0';
              authBox.classList.add('hide');
              
              // 延迟将 DOM 让位
              setTimeout(()=>{ 
                authOverlay.style.display = 'none'; 
                unlockAppInterface();
              }, 400);

           } else {
              flashError();
           }
        } catch(e) {
           alert("与密钥中心失联，请核验网络。");
           btnTxt.innerText = "解锁进入系统";
        }
    }

    function flashError() {
      const err = document.getElementById('loginError');
      err.style.display = 'block';
      authBox.style.animation = 'shake 0.4s';
      setTimeout(()=> authBox.style.animation = '', 400);
      btnTxt.innerText = "重新尝试解锁";
    }

    /* 振动动画 */
    document.head.insertAdjacentHTML('beforeend', \`
      <style>
         @keyframes shake {
            0% { transform: translateX(0); }
            25% { transform: translateX(-8px); }
            50% { transform: translateX(8px); }
            75% { transform: translateX(-8px); }
            100% { transform: translateX(0); }
         }
      </style>
    \`);

    // “驱散迷雾，迎接主体” 的动画接轨动作
    function unlockAppInterface() {
      appWrapper.style.opacity = '1';
      appWrapper.style.transform = 'scale(1)';
      appWrapper.style.filter = 'none';
    }


    // ===================================
    // 历史相册图库 - LocalStorage 库
    // ===================================
    const STORAGE_KEY = 'tc_image_gallery_v2';
    
    document.addEventListener("DOMContentLoaded", loadGallery);

    function saveToGallery(imgData) {
       let list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
       imgData.time = new Date().toLocaleString();
       list.unshift(imgData); 
       localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
       renderGallery(list);
    }

    function loadGallery() {
       let list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
       renderGallery(list);
    }

    function renderGallery(list) {
       const grid = document.getElementById('galleryGrid');
       if (list.length === 0) {
           grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">画廊干涸，尚未有任何珍美画作收录于此，亟待您的首发！</div>';
           return;
       }
       grid.innerHTML = '';
       
       list.forEach((item, index) => {
          const el = document.createElement('div');
          el.className = 'grid-item';
          el.innerHTML = \`
            <img src="\${item.thumb_url || item.url}" class="grid-img" onclick="showHistoryCodes(\${index})" title="点击获取详尽引用格式代码 (\${item.filename})">
            <div class="grid-toolbar">
              <button class="grid-btn" onclick="window.open('\${item.url}','_blank')">👁️ 阅览</button>
              <button class="grid-btn btn-delete" onclick="deleteRemoteImage(\${index}, '\${item.delete_url}')">✖ 销毁</button>
            </div>
          \`;
          grid.appendChild(el);
       });
    }

    async function deleteRemoteImage(index, delUrl) {
       if(!confirm("⚠️ 终极警告：此指令不仅从本机剔除，更会呼叫远程枢纽实行彻底碎化，确认引爆？")) return;
       
       if(delUrl) {
           try { window.open(delUrl, '_blank'); } 
           catch(e) { console.log("抛出异常流"); }
       }
       
       let list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
       list.splice(index, 1);
       localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
       renderGallery(list);
    }

    function clearAllRecords() {
       if(confirm("警告：这将强行格式化您在这台仪器的游览记忆，图源基座本身不受侵夺。允许执行？")) {
          localStorage.removeItem(STORAGE_KEY);
          renderGallery([]);
       }
    }

    // 回显历史图片的详尽代码
    function showHistoryCodes(index) {
       let list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
       let item = list[index];
       if(!item) return;

       document.getElementById('uploadArea').style.display = 'none'; 
       document.getElementById('resultBox').style.display = 'block';
       document.getElementById('resultBadge').innerText = "📌 归档库记录调取成功";
       
       document.getElementById('previewImg').src = item.thumb_url || item.url;
       
       document.getElementById('urlDirect').value = item.url;
       document.getElementById('urlMd').value = '!['+item.filename+']('+item.url+')';
       document.getElementById('urlHtml').value = '<a href="'+item.url+'" target="_blank"><img src="'+item.url+'" alt="'+item.filename+'"></a>';
       document.getElementById('urlBb').value = '[url='+item.url+'][img]'+item.url+'[/img][/url]';
       
       document.getElementById('codesPanel').style.display = 'block';
       
       window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // 重置画布并返回到上传状态
    function resetToUpload() {
       document.getElementById('resultBox').style.display = 'none';
       document.getElementById('codesPanel').style.display = 'none';
       document.getElementById('uploadArea').style.display = 'block';
       document.getElementById('fileInput').value = '';
    }

    /* ===================================
     * 传输与操作主核心业务
     * =================================== */
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    uploadArea.ondragover = e => { e.preventDefault(); uploadArea.classList.add('dragover'); }
    uploadArea.ondragleave = () => uploadArea.classList.remove('dragover');
    uploadArea.ondrop = e => { e.preventDefault(); uploadArea.classList.remove('dragover'); if(e.dataTransfer.files.length) uploadRun(Array.from(e.dataTransfer.files)); }
    fileInput.onchange = e => { if(e.target.files.length) uploadRun(Array.from(e.target.files)); }
    document.addEventListener('paste', e => {
      // 防止在填密码时误触全屏粘贴
      if(document.activeElement === document.getElementById('modalPwd')) return;

      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      const files = [];
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) files.push(item.getAsFile());
      }
      if (files.length > 0) uploadRun(files);
    });

    // 格式化面板弹收
    document.getElementById('previewContainer').onclick = () => {
       const pan = document.getElementById('codesPanel');
       pan.style.display = pan.style.display === 'block' ? 'none' : 'block';
    }

    // 复用复制法
    function copyEl(id) {
       const el = document.getElementById(id); el.select(); document.execCommand('copy');
       const b = el.nextElementSibling; b.innerText="已取库"; setTimeout(()=>b.innerText="采撷", 1500);
    }
    function copyText(txt) {
      const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      alert("采撷直链成功！");
    }

    // 工作流转 (支持单/多文件队列上传)
    async function uploadRun(input) {
      const files = Array.isArray(input) ? input : [input];
      if (files.length === 0) return;

      const localSysKey = CURRENT_UNLOCKED_PWD;
      const loadingEl = document.getElementById('loading');
      const resultBox = document.getElementById('resultBox');
      const resultBadge = document.getElementById('resultBadge');
      
      uploadArea.style.display = 'none'; 
      resultBox.style.display = 'none';
      document.getElementById('codesPanel').style.display = 'none';
      loadingEl.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });

      let successCount = 0;
      let lastData = null;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        loadingEl.innerText = files.length > 1 ? `✨ 正在上传第 ${ i + 1 }/${files.length} 张: ${file.name}` : `✨ 相片极速装载中，稍作须臾...`;

  if (!file.type.startsWith('image/')) {
    console.error(`跳过非图片文件: ${file.name}`);
    continue;
  }
  if (file.size > 32 * 1024 * 1024) {
    alert(`文件 ${file.name} 过大（超过 32MB），已跳过。`);
    continue;
  }

  const fd = new FormData();
  fd.append('file', file);
  if (sysStateRequiresAuth) fd.append('password', localSysKey);

  try {
    const res = await fetch('/upload', { method: 'POST', body: fd });
    const data = await res.json();

    if (res.ok && data.success) {
      successCount++;
      lastData = data;
      // 实时存入画廊
      saveToGallery({
        url: data.url, thumb_url: data.thumb_url, delete_url: data.delete_url, filename: data.filename
      });
    } else {
      const errMsg = res.status === 403 ? '安保拒收：你的信令过期或越权操作已被镇压！' : (data.error || '未名深渊错误');
      alert(`文件 ${file.name} 上传失败: ${errMsg}`);
    }
  } catch (e) {
    alert(`文件 ${file.name} 通讯中断: ${e.message}`);
  }
}

loadingEl.style.display = 'none';
loadingEl.innerText = "✨ 相片极速装载中，稍作须臾...";
uploadArea.style.display = 'block';

if (successCount > 0) {
  resultBox.style.display = 'block';
  resultBadge.innerText = successCount === 1 ? "✅ 画迹已被镌刻！现已收存至下方私密展示廊。" : `✅ 成功镌刻 ${successCount} 张画迹！已悉数存入下方。`;

  // 如果是多个，回显最后一张的信息（也可以改为不回显或展示列表，但目前 UI 结构回显最后一张最稳）
  if (lastData) {
    document.getElementById('urlDirect').value = lastData.url;
    document.getElementById('urlMd').value = '![' + lastData.filename + '](' + lastData.url + ')';
    document.getElementById('urlHtml').value = '<a href="' + lastData.url + '" target="_blank"><img src="' + lastData.url + '" alt="' + lastData.filename + '"></a>';
    document.getElementById('urlBb').value = '[url=' + lastData.url + '][img]' + lastData.url + '[/img][/url]';
    document.getElementById('previewImg').src = lastData.thumb_url || lastData.url;
  }
}
    }
  </script >
</body >
</html >
  `;
}
