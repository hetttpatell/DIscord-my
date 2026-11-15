import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function getAvatarColor(name) {
  const colors = [
    '#FF9F1C',
    '#2EC4B6',
    '#FF5A5F',
    '#E71D36',
    '#A78BFA',
    '#38BDF8',
    '#F472B6',
    '#4ADE80',
  ];
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
