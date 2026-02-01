export class NavigationInterruptError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NavigationInterruptError';
        this.isNavigationInterrupt = true;
    }
}
