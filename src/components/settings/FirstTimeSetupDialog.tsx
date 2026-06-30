import { useRef, useState } from "react";
import {
  PersonalSettingsForm,
  type PersonalSettingsFormHandle,
} from "./PersonalSettingsForm";

interface Props {
  open: boolean;
  blogDir: string;
  /** Called when the user skips (永久不再自动弹出). */
  onSkip: () => void;
  /** Called when the user finishes / closes after saving. */
  onClose: () => void;
}

export function FirstTimeSetupDialog({ open, blogDir, onSkip, onClose }: Props) {
  const formRef = useRef<PersonalSettingsFormHandle>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await formRef.current?.saveProfile();
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <mdui-dialog open={open || undefined}>
      <span slot="headline">完善个人设置</span>
      <div slot="description" className="pt-2">
        <p className="text-sm text-gray-500 mb-4">
          设置你的昵称、头像，并申请一个专属博客网址（可稍后在设置中完成）。
        </p>
        <PersonalSettingsForm
          ref={formRef}
          blogDir={blogDir}
          mode="dialog"
        />
      </div>
      <div slot="action">
        <mdui-button variant="text" onClick={onSkip}>
          跳过
        </mdui-button>
        <mdui-button variant="filled" loading={saving || undefined} onClick={handleSave}>
          保存
        </mdui-button>
      </div>
    </mdui-dialog>
  );
}
