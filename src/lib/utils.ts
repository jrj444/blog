import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const uuidSchema = z.uuid();

/** 校验路由参数里的 id 是否为合法 UUID：非法时页面应走 notFound()，而不是让数据库 cast 报 500 */
export function isUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}
