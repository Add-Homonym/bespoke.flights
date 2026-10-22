/** "1 operator", "2 operators". Pass `many` for an irregular plural. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
