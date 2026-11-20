import { Shell } from '../components/Shell';

export const HBNF_SITE = 'https://hbnightflyers.com/';

export function HbnfPage() {
  return <Shell><main className="hbnf-frame-wrap"><iframe className="hbnf-frame" title="HB Night Flyers" src={HBNF_SITE} allow="clipboard-write" referrerPolicy="strict-origin-when-cross-origin" /></main></Shell>;
}
