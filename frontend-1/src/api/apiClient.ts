import { toast } from "@/hooks/use-toast";
import Cookies from "js-cookie";

export const API_URL = import.meta.env.VITE_API_BASE_URL || "";

export function getAuthToken(): string | undefined {
  return Cookies.get("__session");
}

export async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {},
  headers: HeadersInit = {}
): Promise<T> {
  try {
    const url = `${API_URL}${endpoint}`;
    const token = getAuthToken();

    const response = await fetch(url, {
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      ...options,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error || "API request failed");
    }
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    } else {
      return response as unknown as T;
    }
  } catch (error) {
    console.error("API request error in fetchAPI:", error);
    toast({
      title: "Error",
      description:
        error instanceof Error ? error.message : "An unexpected error occurred",
      variant: "destructive",
    });
    throw error;
  }
}

export async function uploadAPI<T>(
  endpoint: string,
  options: RequestInit = {},
  headers: HeadersInit = {}
): Promise<T> {
  try {
    const url = `${API_URL}${endpoint}`;
    const token = getAuthToken();
    const response = await fetch(url, {
      headers: {
        ...headers,
        Authorization: `Bearer ${token}`,
      },
      ...options,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error || "API request failed");
    }
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    } else {
      return response as unknown as T;
    }
  } catch (error) {
    console.error("API request error:", error);
    toast({
      title: "Error",
      description:
        error instanceof Error ? error.message : "An unexpected error occurred",
      variant: "destructive",
    });
    throw error;
  }
}

export async function fetchBinaryAPI(
  endpoint: string,
  options: RequestInit = {},
  headers: HeadersInit = {}
): Promise<Blob> {
  try {
    const url = `${API_URL}${endpoint}`;
    const token = getAuthToken();
    const response = await fetch(url, {
      headers: {
        ...headers,
        Authorization: `Bearer ${token}`,
      },
      ...options,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || error.error || "API request failed");
    }
    return await response.blob();
  } catch (error) {
    console.error("API request error in fetchBinaryAPI:", error);
    toast({
      title: "Error",
      description:
        error instanceof Error ? error.message : "An unexpected error occurred",
      variant: "destructive",
    });
    throw error;
  }
}
