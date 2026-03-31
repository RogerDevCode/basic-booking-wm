import { z } from "zod";

declare const brand: unique symbol;
export type Brand<T, TBrand extends string> = T & { readonly [brand]: TBrand };

export type ProviderID = Brand<string, "ProviderID">;
export type PatientID = Brand<string, "PatientID">;
export type BookingID = Brand<string, "BookingID">;
export type ServiceID = Brand<string, "ServiceID">;

export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

export const ok = <T>(data: T): Result<T, never> => ({ success: true, data });
export const err = <E>(error: E): Result<never, E> => ({ success: false, error });

export type Option<T> = 
  | { type: 'some'; value: T }
  | { type: 'none' };

export const some = <T>(value: T): Option<T> => ({ type: 'some', value });
export const none = <T>(): Option<T> => ({ type: 'none' });
