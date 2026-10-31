// Shared domain types for the Learn Jest companion project.

export interface User {
  id: string;
  name: string;
  email: string;
  plan: 'free' | 'pro' | 'enterprise';
}

export interface CartLine {
  sku: string;
  unitPrice: number; // in cents, to avoid floating point drift
  quantity: number;
}

/** Minimal HTTP abstraction so services can be tested without a network. */
export interface HttpClient {
  get<T>(url: string): Promise<T>;
}

/** Side-effect boundary: anything that sends messages to the outside world. */
export interface Notifier {
  send(to: string, message: string): Promise<void>;
}

export class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} ${id} not found`);
    this.name = 'NotFoundError';
  }
}
