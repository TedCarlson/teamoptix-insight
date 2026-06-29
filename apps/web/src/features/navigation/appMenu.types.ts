export type AppMenuItem = {
  key: string;
  label: string;
  href: string;
  match?: (pathname: string) => boolean;
};

export type AppMenuSection = {
  key: string;
  label: string;
  items: AppMenuItem[];
};
