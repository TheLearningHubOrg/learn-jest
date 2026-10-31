// A service with two collaborators, injected through the constructor.
// Tests replace both with jest.fn() based doubles; no module mocking required.
import { NotFoundError, type HttpClient, type Notifier, type User } from './types.js';

export class UserService {
  private readonly cache = new Map<string, User>();

  constructor(
    private readonly http: HttpClient,
    private readonly notifier: Notifier,
    private readonly baseUrl = 'https://api.example.com',
  ) {}

  async getUser(id: string): Promise<User> {
    const cached = this.cache.get(id);
    if (cached) return cached;

    const user = await this.http.get<User | null>(`${this.baseUrl}/users/${encodeURIComponent(id)}`);
    if (!user) throw new NotFoundError('User', id);

    this.cache.set(id, user);
    return user;
  }

  /** Fetches users in parallel; a single failure rejects the whole call. */
  async getUsers(ids: string[]): Promise<User[]> {
    return Promise.all(ids.map((id) => this.getUser(id)));
  }

  /** Sends a welcome message and reports which recipients failed, without throwing. */
  async welcome(ids: string[]): Promise<{ sent: string[]; failed: string[] }> {
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const user = await this.getUser(id);
        await this.notifier.send(user.email, `Welcome aboard, ${user.name}!`);
        return id;
      }),
    );

    const sent: string[] = [];
    const failed: string[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') sent.push(result.value);
      else failed.push(ids[index]!);
    });
    return { sent, failed };
  }
}
