import express from 'express';
import {
  AdminInitiateAuthCommand,
  CognitoIdentityProviderClient
} from '@aws-sdk/client-cognito-identity-provider';

const port = Number(process.env.PORT ?? '8080');
const apiBaseUrl = requiredEnv('API_BASE_URL').replace(/\/$/, '');
const userPoolId = requiredEnv('COGNITO_USER_POOL_ID');
const clientId = requiredEnv('COGNITO_CLIENT_ID');
const cognitoRegion = process.env.COGNITO_REGION ?? 'ap-northeast-2';

const cognito = new CognitoIdentityProviderClient({ region: cognitoRegion });
const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (_req, res) => {
  res.type('html').send(page());
});

app.post('/login', async (req, res) => {
  const username = String(req.body.username ?? '');
  const password = String(req.body.password ?? '');

  if (!username || !password) {
    res.status(400).json({ message: 'username and password are required' });
    return;
  }

  try {
    const response = await cognito.send(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password
        }
      })
    );

    if (!response.AuthenticationResult?.IdToken) {
      res.status(401).json({ message: 'login did not return an id token' });
      return;
    }

    res.json({
      idToken: response.AuthenticationResult.IdToken,
      accessToken: response.AuthenticationResult.AccessToken,
      expiresIn: response.AuthenticationResult.ExpiresIn
    });
  } catch (error) {
    console.error(error);
    res.status(401).json({ message: 'login failed' });
  }
});

app.get('/config', (_req, res) => {
  res.json({
    apiBaseUrl,
    cognitoRegion,
    userPoolId,
    clientId
  });
});

app.listen(port, () => {
  console.log(`commerce auth frontend listening on ${port}`);
});

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function page() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Commerce Console</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f7f8fb; color: #172033; }
    main { width: min(980px, calc(100vw - 40px)); margin: 40px auto; }
    header { display: flex; justify-content: space-between; align-items: end; gap: 24px; margin-bottom: 28px; }
    h1 { margin: 0; font-size: 28px; line-height: 1.1; letter-spacing: 0; }
    .subtle { color: #62708a; font-size: 14px; }
    .grid { display: grid; grid-template-columns: 360px 1fr; gap: 20px; align-items: start; }
    section { background: #fff; border: 1px solid #dde3ee; border-radius: 8px; padding: 18px; box-shadow: 0 1px 2px rgba(23,32,51,.04); }
    label { display: block; font-weight: 650; font-size: 13px; margin: 14px 0 6px; }
    input, select { width: 100%; box-sizing: border-box; border: 1px solid #c8d1df; border-radius: 6px; padding: 10px 11px; font-size: 14px; }
    button { border: 0; border-radius: 6px; padding: 10px 13px; background: #225ea8; color: #fff; font-weight: 700; cursor: pointer; }
    button.secondary { background: #25364d; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .row { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; background: #101828; color: #d7e2f1; border-radius: 8px; padding: 14px; min-height: 290px; font-size: 13px; line-height: 1.45; }
    .status { margin-top: 14px; color: #506079; font-size: 13px; min-height: 18px; }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } header { display: block; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Commerce Console</h1>
        <div class="subtle">Cognito protected API Gateway smoke console</div>
      </div>
      <div class="subtle" id="apiBase"></div>
    </header>
    <div class="grid">
      <section>
        <form id="loginForm">
          <label for="username">Username</label>
          <input id="username" name="username" autocomplete="username" required>
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required>
          <div class="row">
            <button type="submit">Sign in</button>
            <button class="secondary" type="button" id="clearToken">Clear token</button>
          </div>
        </form>
        <label for="endpoint">Protected endpoint</label>
        <select id="endpoint">
          <option value="/api/product">/api/product</option>
          <option value="/api/buy">/api/buy</option>
          <option value="/api/payment">/api/payment</option>
          <option value="/api/order-mgmt">/api/order-mgmt</option>
          <option value="/api/inventory-mgmt">/api/inventory-mgmt</option>
          <option value="/api/cart">/api/cart</option>
          <option value="/api/customer">/api/customer</option>
          <option value="/api/shipping">/api/shipping</option>
          <option value="/api/notification">/api/notification</option>
        </select>
        <div class="row">
          <button type="button" id="callProtected">Call protected API</button>
          <button class="secondary" type="button" id="callPublic">Call public auth API</button>
        </div>
        <div class="status" id="status"></div>
      </section>
      <section>
        <pre id="output">Ready.</pre>
      </section>
    </div>
  </main>
  <script>
    let config = null;
    const output = document.querySelector('#output');
    const status = document.querySelector('#status');
    const apiBase = document.querySelector('#apiBase');

    init();

    async function init() {
      config = await fetch('/config').then(r => r.json());
      apiBase.textContent = config.apiBaseUrl;
      setStatus(localStorage.getItem('idToken') ? 'Signed in token is present.' : 'No token in this browser.');
    }

    document.querySelector('#loginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      setStatus('Signing in...');
      const body = new URLSearchParams(new FormData(event.target));
      const response = await fetch('/login', { method: 'POST', body });
      const payload = await response.json();
      if (!response.ok) {
        setStatus('Sign in failed.');
        render(response.status, payload);
        return;
      }
      localStorage.setItem('idToken', payload.idToken);
      setStatus('Signed in. ID token saved in this browser.');
      render(response.status, { expiresIn: payload.expiresIn, tokenPreview: payload.idToken.slice(0, 32) + '...' });
    });

    document.querySelector('#clearToken').addEventListener('click', () => {
      localStorage.removeItem('idToken');
      setStatus('Token cleared.');
      output.textContent = 'Ready.';
    });

    document.querySelector('#callPublic').addEventListener('click', async () => {
      await callApi('/api/auth', false);
    });

    document.querySelector('#callProtected').addEventListener('click', async () => {
      await callApi(document.querySelector('#endpoint').value, true);
    });

    async function callApi(path, protectedCall) {
      const headers = {};
      if (protectedCall) {
        const token = localStorage.getItem('idToken');
        if (!token) {
          setStatus('Sign in first.');
          return;
        }
        headers.Authorization = 'Bearer ' + token;
      }
      setStatus('Calling ' + path + '...');
      const response = await fetch(config.apiBaseUrl + path, { headers });
      const text = await response.text();
      let payload = text;
      try { payload = JSON.parse(text); } catch (_) {}
      setStatus('HTTP ' + response.status);
      render(response.status, payload);
    }

    function render(statusCode, payload) {
      output.textContent = JSON.stringify({ statusCode, payload }, null, 2);
    }

    function setStatus(value) {
      status.textContent = value;
    }
  </script>
</body>
</html>`;
}
