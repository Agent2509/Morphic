export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

const noop = () => {};

export const silentLogger: Logger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
};

export const consoleLogger: Logger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
  debug: (m) => console.debug(m),
};
