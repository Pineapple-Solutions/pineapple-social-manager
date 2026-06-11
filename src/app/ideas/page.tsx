// src/app/ideas/page.tsx — Redirect: funzionalità accorpata in Content Studio (/posts → tab Brainstorming)
import { redirect } from 'next/navigation';

export default function IdeasRedirectPage() {
  redirect('/posts');
}
