declare namespace React {
  type ReactNode = unknown;
  type ElementType = (props: any) => any;
  interface HTMLAttributes<T> { className?: string; children?: ReactNode; key?: any; [key: string]: any; }
  interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> { disabled?: boolean; onClick?: any; }
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> { type?: string; value?: any; onChange?: any; step?: any; }
}
export type ReactNode = React.ReactNode;
export type ElementType = React.ElementType;
export type HTMLAttributes<T> = React.HTMLAttributes<T>;
export type ButtonHTMLAttributes<T> = React.ButtonHTMLAttributes<T>;
export type InputHTMLAttributes<T> = React.InputHTMLAttributes<T>;
export function useMemo<T>(factory: () => T, deps?: unknown[]): T;
export function useState<T>(initial: T): [T, (value: T) => void];
export as namespace React;
declare global {
  namespace JSX {
    interface Element { [key: string]: any; }
    interface ElementChildrenAttribute { children: {}; }
    interface IntrinsicAttributes { key?: any; }
    interface IntrinsicElements { [elemName: string]: any; }
  }
}
