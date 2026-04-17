export const DateUtils = {
  format(dateStr: string, tz: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-AR', {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  },

  getWeekDates(offset: number): readonly { date: string; label: string; dayName: string }[] {
    const dates: { date: string; label: string; dayName: string }[] = [];
    const today = new Date();
    today.setDate(today.getDate() + offset);

    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const iso = d.toISOString();
      const dateStr = iso.split('T')[0] ?? iso.slice(0, 10);
      const dayName = d.toLocaleDateString('es-AR', { weekday: 'short' });
      const label = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
      dates.push({ date: dateStr, label, dayName });
    }
    return dates;
  },

  parseDate(input: string): string | null {
    const lower = input.toLowerCase();
    const dates = this.getWeekDates(0).concat(this.getWeekDates(7));
    for (const d of dates) {
      if (lower.includes(d.label.toLowerCase()) || lower.includes(d.date)) {
        return d.date;
      }
    }
    return null;
  },

  parseTime(input: string): string | null {
    const match = /(\d{1,2}):?(\d{2})?/.exec(input);
    if (match === null) return null;
    const hStr = match[1];
    if (hStr === undefined) return null;
    const h = parseInt(hStr, 10);
    if (Number.isNaN(h)) return null;
    const mStr = match[2];
    const m = mStr !== undefined ? parseInt(mStr, 10) : 0;
    if (Number.isNaN(m)) return null;
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
    return null;
  },

  generateTimeSlots(startHour: number, endHour: number, durationMin: number): readonly string[] {
    const slots: string[] = [];
    for (let h = startHour; h < endHour; h++) {
      for (let m = 0; m < 60; m += durationMin) {
        const hour = h.toString().padStart(2, '0');
        const min = m.toString().padStart(2, '0');
        slots.push(`${hour}:${min}`);
      }
    }
    return slots;
  },
};
