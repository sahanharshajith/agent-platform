import { useState } from "react";
import { CognitoUserPool, CognitoUser, AuthenticationDetails } from "amazon-cognito-identity-js";

const poolData = {
  UserPoolId: import.meta.env.VITE_COGNITO_POOL_ID,
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
};

export default function Login({ onLoggedIn }) {
  const [email, setEmail] = useState("admin@demo.com");
  const [password, setPassword] = useState("Test123!");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);

    const userPool = new CognitoUserPool(poolData);
    const user = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });

    user.setAuthenticationFlowType("USER_PASSWORD_AUTH");
    user.authenticateUser(authDetails, {
      onSuccess: (session) => {
        const idToken = session.getIdToken().getJwtToken();
        const payload = session.getIdToken().decodePayload();
        localStorage.setItem("id_token", idToken);
        localStorage.setItem("id_token_exp", String(Date.now() + session.getIdToken().getExpiration() * 1000));
        localStorage.setItem("tenant_id", payload["custom:tenant_id"] || "boc-tenant-01");
        setBusy(false);
        onLoggedIn({ token: idToken, tenantId: payload["custom:tenant_id"] });
      },
      onFailure: (err) => {
        setBusy(false);
        setError(err.message || "Login failed");
      },
    });
  };

  return (
    <div className="h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/10 via-slate-950 to-slate-950 pointer-events-none" />
      <form onSubmit={submit} className="relative bg-slate-900/60 backdrop-blur-sm border border-slate-800/60 rounded-2xl p-8 w-96 space-y-5 shadow-2xl shadow-black/40">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Sign in</h1>
          <p className="text-xs text-slate-500">Sign in to access your agent workspace</p>
        </div>
        <div>
          <label className="text-xs text-slate-400">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-950/70 border border-slate-700/60 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-200"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-950/70 border border-slate-700/60 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-200"
          />
        </div>
        {error && <div className="text-red-400 text-xs">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-2.5 rounded-lg text-sm font-medium text-white shadow-lg shadow-indigo-900/30 transition-all duration-200"
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}