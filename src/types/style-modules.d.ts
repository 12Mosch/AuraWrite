/**
 * Wildcard module declarations for style imports so side-effect and CSS module
 * imports work in TypeScript without errors.
 *
 * Examples:
 *  import "./styles.css";              // side-effect import
 *  import styles from "./styles.module.css"; // typed module import
 */

declare module "*.css" {
	const content: string;
	export default content;
}
declare module "*.scss" {
	const content: string;
	export default content;
}
declare module "*.sass" {
	const content: string;
	export default content;
}
declare module "*.less" {
	const content: string;
	export default content;
}

/* Module-style variants (named import returns a readonly map of class names) */
declare module "*.module.css" {
	const classes: { readonly [className: string]: string };
	export default classes;
}
declare module "*.module.scss" {
	const classes: { readonly [className: string]: string };
	export default classes;
}
declare module "*.module.sass" {
	const classes: { readonly [className: string]: string };
	export default classes;
}
declare module "*.module.less" {
	const classes: { readonly [className: string]: string };
	export default classes;
}
