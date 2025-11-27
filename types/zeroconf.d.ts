declare module "react-native-zeroconf" {
  interface Service {
    name: string;
    fullName: string;
    host: string;
    port: number;
    addresses: string[];
    txt: Record<string, string>;
  }

  type ZeroconfEvent =
    | "start"
    | "stop"
    | "found"
    | "resolved"
    | "remove"
    | "update"
    | "error";

  class Zeroconf {
    constructor();
    scan(type?: string, protocol?: string, domain?: string): void;
    stop(): void;
    getServices(): Record<string, Service>;
    on(event: ZeroconfEvent, callback: (data: any) => void): void;
    removeDeviceListeners(): void;
  }

  export default Zeroconf;
}
