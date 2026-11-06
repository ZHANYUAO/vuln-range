export declare class ServiceContainer {
    private services;
    register<T>(name: string, service: T): void;
    get<T>(name: string): T;
}
