
import { User } from "../types";

const DB_KEY = "flora_genius_users_db";
const SESSION_KEY = "flora_genius_active_session";

export const authService = {
  getUsers: (): User[] => {
    const data = localStorage.getItem(DB_KEY);
    return data ? JSON.parse(data) : [];
  },

  signup: (email: string, name: string, password: string): User => {
    const users = authService.getUsers();
    if (users.find(u => u.email === email)) {
      throw new Error("User already exists");
    }
    const newUser: User = {
      id: crypto.randomUUID(),
      email,
      name,
      isPro: false,
      joinedDate: new Date().toISOString()
    };
    localStorage.setItem(DB_KEY, JSON.stringify([...users, newUser]));
    authService.saveSession(newUser);
    return newUser;
  },

  login: (email: string, password: string): User => {
    // Simple mock: password is just "password" for demo purposes
    const users = authService.getUsers();
    const user = users.find(u => u.email === email);
    if (!user) {
      throw new Error("User not found");
    }
    authService.saveSession(user);
    return user;
  },

  logout: () => {
    localStorage.removeItem(SESSION_KEY);
  },

  saveSession: (user: User) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  },

  getSession: (): User | null => {
    const data = localStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : null;
  },

  upgradeToPro: (userId: string): User => {
    const users = authService.getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) throw new Error("User not found");
    
    users[userIndex].isPro = true;
    localStorage.setItem(DB_KEY, JSON.stringify(users));
    authService.saveSession(users[userIndex]);
    return users[userIndex];
  }
};
