
export function validateRut(rut: string): boolean {
    const clean = rut.replace(/[.]/g, '').replace(/-/g, '').toUpperCase();
    if (clean.length < 2) return false;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    if (!/^\d+$/.test(body)) return false;
    if (!/^[\dK]$/.test(dv)) return false;
    let sum = 0;
    let multiplier = 2;
    for (let i = body.length - 1; i >= 0; i--) {
    const digit = body[i];
    if (digit === undefined) continue;
    sum += Number.parseInt(digit) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }

    const remainder = 11 - (sum % 11);
    const expectedDv = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
    return dv === expectedDv;
}
