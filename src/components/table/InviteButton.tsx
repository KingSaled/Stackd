import { Check, Link2, Share2 } from 'lucide-react';
import { useState } from 'react';
import { recallRoomPassword } from '../../lib/storage';
import { toast } from '../../store/toast';
import { sound } from '../../lib/sound';

export function inviteLink(roomId: string, includePassword = true) {
  const pw = includePassword ? recallRoomPassword(roomId) : null;
  return `${window.location.origin}/t/${roomId}${pw ? `#key=${encodeURIComponent(pw)}` : ''}`;
}

export function InviteButton({ roomId, roomName, compact }: { roomId: string; roomName: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const onClick = async () => {
    const url = inviteLink(roomId);
    sound.play('click');
    if (canShare) {
      try {
        await navigator.share({ title: `Join ${roomName} on Stackd`, text: `Pull up a chair at ${roomName} 🃏`, url });
        return;
      } catch {
        /* fall back to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Invite link copied — send it to your friends!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this invite link:', url);
    }
  };
  return (
    <button className="btn btn--gold btn--sm invite-btn" onClick={onClick} aria-label="Invite friends">
      {copied ? <Check size={16} /> : canShare ? <Share2 size={16} /> : <Link2 size={16} />}
      {!compact && <span>{copied ? 'Copied' : 'Invite'}</span>}
    </button>
  );
}
