import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";

interface Props {
  open: boolean;
  onClose: () => void;
  onSwitchToRegister: () => void;
}

export function LoginDialog({ open, onClose, onSwitchToRegister }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      setError("请填写邮箱和密码");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      // TODO Phase 4.2: if (!user.siteSlug) trigger site setup dialog
      setEmail("");
      setPassword("");
      onClose();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) handleLogin();
  };

  return (
    <mdui-dialog open={open || undefined}>
      <span slot="headline">登录</span>
      <div slot="description" className="space-y-4 pt-2" onKeyDown={handleKeyDown}>
        <mdui-text-field
          variant="outlined"
          label="邮箱"
          type="email"
          value={email}
          onInput={(e: any) => setEmail(e.target.value)}
        />
        <mdui-text-field
          variant="outlined"
          label="密码"
          type="password"
          toggle-password
          value={password}
          onInput={(e: any) => setPassword(e.target.value)}
        />
        {error && (
          <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>
        )}
        <p className="text-sm text-gray-500" style={{ marginTop: 8 }}>
          没有账号？
          <a className="cursor-pointer" style={{ color: "rgb(var(--mdui-color-primary-light))" }} onClick={onSwitchToRegister}>注册</a>
        </p>
      </div>
      <div slot="action">
        <mdui-button variant="text" onClick={onClose}>取消</mdui-button>
        <mdui-button variant="filled" loading={loading || undefined} onClick={handleLogin}>
          登录
        </mdui-button>
      </div>
    </mdui-dialog>
  );
}
