import { Signal } from './signal.v1';

export type ComponentProps = Record<string, any>;
export type ComponentState = Record<string, any>;

/**
 * Abstract class for all components.
 *
 * A component is a self-contained piece of code that represents a UI element.
 * It can have its own state and props, and can be composed together to form
 * a larger UI.
 *
 * Each component should override the `render` method to return its own
 * HTML element.
 *
 * Components can also override the `componentDidMount`, `componentDidUpdate`,
 * and `componentWillUnmount` methods to perform actions at different stages
 * of their lifecycle.
 *
 * @example
 * class MyComponent extends Component {
 *   render() {
 *     return html`<div>My Component</div>`;
 *   }
 * }
 */
abstract class Component<
    P extends ComponentProps = {},
    S extends ComponentState = {}
> {
    private _root: HTMLElement | null = null;
    private _observer: MutationObserver | null = null;
    private preSignal: any[] = [];
    private effects: Array<{
        callback: () => (() => void) | void;
        dependenciesGetter: () => any[];
    }> = [];
    private prevDependencies: any[] = [];
    protected state: S = {} as S;
    protected props: P = {} as P;

    /**
     * Constructor for the component.
     *
     * @param _props The props for the component.
     */
    constructor(_props: P = {} as P) {
        this.props = _props;

        this.addEffect.bind(this);
        this.addSignal.bind(this);
        this.registerObserver.bind(this);
        this.runEffects.bind(this);
        this.setState.bind(this);
        this.componentDidMount.bind(this);
        this.componentDidUpdate.bind(this);
        this.componentWillUnmount.bind(this);
        this.hasCustomComponentWillUnmount.bind(this);
        this.reRender.bind(this);
        this.query.bind(this);
    }

    /**
     * Get the HTML element for the component.
     *
     * The first time this is called, the component will render itself and
     * register an observer to detect when it is removed from the DOM.
     *
     * @returns The HTML element for the component.
     */
    get html(): HTMLElement {
        if (!this._root) {
            this._root = this.render();
            // Only register observer if the component overrides componentWillUnmount
            if (this.hasCustomComponentWillUnmount()) {
                this.registerObserver();
            }
        }
        this.componentDidMount();
        this.runEffects();
        return this._root;
    }

    /**
     * Create a new instance of the component with the given props.
     *
     * @param _props The props for the new component.
     * @returns The new component.
     */
    static r<P extends ComponentProps>(
        this: new (_props: P) => Component<P, any>,
        _props: P = {} as P
    ): HTMLElement {
        const component = new this(_props);
        return component.html;
    }

    /**
     * Render the component.
     *
     * @returns The HTML element for the component.
     */
    abstract render(): HTMLElement;

    /**
     * Update the component's state.
     *
     * @param newState The new state for the component.
     */
    protected setState(newState: S | ((prevState: S) => S)) {
        const updatedState =
            typeof newState === 'function' ? newState(this.state) : newState;
        if (updatedState === this.state) return;
        this.state = updatedState;
        const newRoot = this.render();
        if (this._root && this._root.parentNode) {
            this._root.replaceWith(newRoot);
            this._root = newRoot;
        }
        this.componentDidUpdate();
        this.runEffects();
    }

    private reRender() {
        const newRoot = this.render();
        if (this._root && this._root.parentNode) {
            this._root.replaceWith(newRoot);
            this._root = newRoot;
        }
    }

    query(selector: string): HTMLElement {
        const node = this._root?.querySelector(selector) as HTMLElement;

        if (!node) {
            console.error(
                `Element not found: ${selector} in ${this.constructor.name}`
            );
        }
        return node;
    }

    /**
     * Lifecycle method: Mount
     *
     * Called after the component is mounted to the DOM.
     */
    componentDidMount() {
        // Called after the component is mounted to the DOM
    }

    /**
     * Lifecycle method: Update
     *
     * Called after the component's state or props have changed.
     */
    componentDidUpdate() {
        // Called after the component's state or props have changed
    }

    /**
     * Lifecycle method: Unmount
     *
     * Called before the component is removed from the DOM.
     */
    componentWillUnmount() {
        // Called before the component is removed from the DOM
    }

    /**
     * Register an observer to detect when the component is removed from the DOM.
     *
     * Only called if the component overrides componentWillUnmount.
     */
    private registerObserver() {
        if (!this._root) return;
        this._observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (
                    mutation.type === 'childList' &&
                    mutation.removedNodes.length > 0
                ) {
                    const removed = Array.from(mutation.removedNodes).includes(
                        this._root!
                    );
                    if (removed) {
                        this.componentWillUnmount();
                        this._observer?.disconnect();
                        break;
                    }
                }
            }
        });

        // Start observing changes in the DOM
        this._observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    /**
     * Check if the component has overridden componentWillUnmount.
     *
     * @returns True if the component has overridden the method.
     */
    private hasCustomComponentWillUnmount(): boolean {
        // Get the prototype of the component
        const proto = Object.getPrototypeOf(this);

        // Check if the method is defined directly on the prototype (not inherited)
        return proto.hasOwnProperty('componentWillUnmount');
    }

    /**
     * Register an effect.
     *
     * @param callback The effect callback. Can return a cleanup function.
     * @param dependencies The dependencies for the effect.
     */
    protected addEffect(
        callback: () => (() => void) | void,
        dependenciesGetter: () => any[]
    ) {
        this.effects.push({ callback, dependenciesGetter });
    }

    /**
     * Run all effects and trigger cleanup if necessary.
     */
    private runEffects() {
        this.effects.forEach((effect, index) => {
            const hasChanged = effect
                ?.dependenciesGetter()
                .some((dep, i) => dep !== this.prevDependencies[index]?.[i]);

            if (hasChanged) {
                effect.callback();
                this.prevDependencies[index] = effect.dependenciesGetter();
            }
        });
    }

    addSignal<T>(signal: Signal<T>) {
        const value = signal.get;
        this.preSignal.push(value);
        const index = this.preSignal.indexOf(value);
        const unsubscribe = signal.subscribe((value) => {
            if (this.preSignal[index] === value) {
                return;
            }
            this.preSignal[index] = value;
            this.reRender();
        });
        return unsubscribe;
    }
}

export default Component;