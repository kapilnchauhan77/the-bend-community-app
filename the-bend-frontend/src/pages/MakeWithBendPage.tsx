import { PageLayout } from '@/components/layout/PageLayout';
import { buildMaxGmailComposeUrl, buildMaxMailtoUrl, maxPortfolioGroups, maxPortfolioProjects, maxProcessSteps, maxServiceExamples } from '@/data/maxOffering';

const BRONZE = 'hsl(35, 45%, 42%)';
const BORDER = 'hsl(35, 18%, 84%)';
const LIGHT_BRONZE = 'hsl(35, 55%, 28%)';
const LIGHT_SUPPORTING = 'hsl(30, 10%, 35%)';

export default function MakeWithBendPage() {
  return (
    <PageLayout>
      <style>{`
        .max-page { --max-accent: ${LIGHT_BRONZE}; --max-cta: ${LIGHT_BRONZE}; }
        html.dark .max-page { --max-accent: hsl(35, 55%, 60%); --max-cta: ${LIGHT_BRONZE}; }
        html.dark .max-page [data-max-offer-body], html.dark .max-page [data-max-dependency] { color: hsl(40, 8%, 72%) !important; }
        html.dark .max-page .max-heading { color: hsl(40, 15%, 88%); }
      `}</style>
      <div className="max-page">
      <section className="bg-[hsl(160,25%,24%)] px-4 py-16 text-white md:py-24">
        <div className="mx-auto max-w-5xl">
          <img src="/images/the-bend-community-logo-white.png" alt="The Bend Community" className="mb-10 h-14 w-auto max-w-full object-contain" />
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-[hsl(35,45%,65%)]">Max</p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-wide md:text-6xl">Make with BEND</h1>
          <p className="mt-5 text-lg text-[hsl(160,15%,78%)]">Custom digital products for ideas that need more than a standard template.</p>
          <p className="mt-7 text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(35,45%,65%)]">Custom pricing</p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-14 md:py-20">
        <section aria-labelledby="offer-heading" className="mb-20 rounded border bg-[hsl(40,20%,98%)] p-6 md:p-8" style={{ borderColor: BORDER }}>
          <h2 id="offer-heading" className="max-heading text-2xl font-bold text-[hsl(160,25%,24%)]">A lasting product, quoted separately</h2>
          <p data-max-offer-body className="mt-3 max-w-3xl text-sm leading-relaxed" style={{ color: LIGHT_SUPPORTING }}>A custom solution does not expire like an ad placement. Hosting, maintenance, support, third-party fees, scope, licensing, and ownership are defined separately by the quote.</p>
        </section>
        <section aria-labelledby="services-heading" className="mb-20">
          <p data-max-accent className="mb-2 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--max-accent)' }}>Possible starting points</p>
          <h2 id="services-heading" className="max-heading mb-8 text-3xl font-bold text-[hsl(160,25%,24%)]">What we can build</h2>
          <div className="grid gap-5 md:grid-cols-2">
            {maxServiceExamples.map((service) => (
              <article key={service.title} className="rounded border bg-[hsl(40,20%,98%)] p-6" style={{ borderColor: BORDER }}>
                <h3 className="max-heading mb-2 text-xl font-bold text-[hsl(160,25%,24%)]">{service.title}</h3>
                <p className="text-sm leading-relaxed text-[hsl(30,10%,40%)]">{service.description}</p>
                <p data-max-dependency className="mt-4 border-t pt-4 text-xs leading-relaxed" style={{ borderColor: BORDER, color: LIGHT_SUPPORTING }}><span className="font-semibold" style={{ color: 'var(--max-accent)' }}>Dependency:</span> {service.dependencyNote}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="work-heading" className="mb-20">
          <h2 id="work-heading" className="max-heading mb-8 text-3xl font-bold text-[hsl(160,25%,24%)]">Selected work</h2>
          <div className="space-y-10">
            {maxPortfolioGroups.map((group) => {
              const projects = maxPortfolioProjects.filter((project) => project.groupId === group.id);
              if (projects.length === 0) return null;
              return <div key={group.id} data-portfolio-group><h3 className="max-heading mb-5 text-xl font-bold text-[hsl(160,25%,24%)]">{group.label}</h3><div className="grid gap-8 md:grid-cols-2">{projects.map((project) => (
              <article key={project.slug} className="overflow-hidden rounded border bg-[hsl(40,20%,98%)]" style={{ borderColor: BORDER }}>
                <div className="bg-[hsl(35,15%,94%)] p-2"><img src={project.image.src} alt={project.image.alt} width={project.image.width} height={project.image.height} loading="lazy" decoding="async" className="aspect-video h-auto w-full object-contain" /></div>
                <div className="p-5"><h4 className="max-heading text-xl font-bold text-[hsl(160,25%,24%)]">{project.name}</h4><p className="mt-2 text-sm leading-relaxed text-[hsl(30,10%,40%)]">{project.contribution}</p><a data-max-accent href={project.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-xs font-semibold uppercase tracking-wide underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" style={{ color: 'var(--max-accent)' }}>View public page</a></div>
              </article>
            ))}</div></div>;
            })}
          </div>
        </section>

        <section aria-labelledby="process-heading" className="mb-20">
          <h2 id="process-heading" className="max-heading mb-8 text-3xl font-bold text-[hsl(160,25%,24%)]">How it works</h2>
          <div className="grid gap-5 md:grid-cols-4">
            {maxProcessSteps.map((step) => <article key={step.number} className="border-l-2 pl-4" style={{ borderColor: BRONZE }}><p data-max-accent className="text-sm font-bold" style={{ color: 'var(--max-accent)' }}>{step.number}</p><h3 className="max-heading mt-2 text-lg font-bold text-[hsl(160,25%,24%)]">{step.title}</h3><p className="mt-2 text-sm leading-relaxed text-[hsl(30,10%,45%)]">{step.description}</p></article>)}
          </div>
        </section>

        <section className="rounded bg-[hsl(160,25%,24%)] px-6 py-10 text-white md:px-10" aria-labelledby="inquiry-heading">
          <h2 id="inquiry-heading" className="text-3xl font-bold">Have an idea?</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[hsl(160,15%,78%)]">Work with the creators of The Bend on a custom solution.</p>
          <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center">
            <a data-max-cta href={buildMaxGmailComposeUrl()} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" style={{ backgroundColor: 'var(--max-cta)' }}>Tell us your idea</a>
            <a href={buildMaxMailtoUrl()} className="text-sm text-[hsl(35,45%,70%)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Use another email app</a>
          </div>
        </section>
      </div>
      </div>
    </PageLayout>
  );
}
