import { z } from "zod";

export const countryRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  language: z.string(),
});

export type CountryRecord = z.infer<typeof countryRecordSchema>;
