import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";

interface Props {
  open: boolean;
  onClose: () => void;
  onSwitchToLogin: () => void;
}

export function RegisterDialog({ open, onClose, onSwitchToLogin }: Props) {
  const { register, requestVerification } = useAuth();
  const [mode, setMode] = useState<"form" | "verify-sent">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (open) {
      setMode("form");
      setError("");
    }
  }, [open]);

  const handleRegister = async () => {
    if (!email || !password || !passwordConfirm) {
      setError("请填写所有字段");
      return;
    }
    if (password !== passwordConfirm) {
      setError("两次密码不一致");
      return;
    }
    if (password.length < 8) {
      setError("密码长度至少为 8 位");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await register(email, password);
      setMode("verify-sent");
      setCountdown(120);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await requestVerification(email);
      setCountdown(120);
    } catch (e: any) {
      setError(String(e));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading && mode === "form") handleRegister();
  };

  return (
    <mdui-dialog open={open || undefined}>
      <span slot="headline">{mode === "form" ? "注册" : "验证邮箱"}</span>
      <div slot="description" className="space-y-4 pt-2" onKeyDown={handleKeyDown}>
        {mode === "form" ? (
          <>
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
              helper="至少 8 位"
            />
            <mdui-text-field
              variant="outlined"
              label="确认密码"
              type="password"
              toggle-password
              value={passwordConfirm}
              onInput={(e: any) => setPasswordConfirm(e.target.value)}
            />
            {error && (
              <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>
            )}
            <p className="text-sm text-gray-500" style={{ marginTop: 8 }}>
              已有账号？
              <a className="cursor-pointer" style={{ color: "rgb(var(--mdui-color-primary-light))" }} onClick={onSwitchToLogin}>登录</a>
            </p>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: "#16a34a" }}>
              验证邮件已发送到 <strong>{email}</strong>
            </p>
            <p className="text-sm text-gray-500">
              请前往邮箱点击验证链接完成注册，验证后返回登录。
            </p>
            {countdown > 0 ? (
              <p className="text-sm text-gray-400">
                未收到邮件？{countdown} 秒后可重发
              </p>
            ) : (
              <mdui-button variant="text" onClick={handleResend}>
                重新发送验证邮件
              </mdui-button>
            )}
            {error && (
              <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>
            )}
          </div>
        )}
      </div>
      <div slot="action">
        {mode === "form" ? (
          <>
            <mdui-button variant="text" onClick={onClose}>取消</mdui-button>
            <mdui-button variant="filled" loading={loading || undefined} onClick={handleRegister}>
              注册
            </mdui-button>
          </>
        ) : (
          <>
            <mdui-button variant="text" onClick={onClose}>取消</mdui-button>
            <mdui-button variant="filled" onClick={onSwitchToLogin}>
              我已验证，去登录
            </mdui-button>
          </>
        )}
      </div>
    </mdui-dialog>
  );
}
