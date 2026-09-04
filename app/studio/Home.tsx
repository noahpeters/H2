import {StudioFooter} from './StudioFooter';
import {StudioHeader} from './StudioHeader';

const projects = [
  {
    title: "White Oak Kitchen",
    meta: "Custom cabinetry · Riverside, CA",
    image: "/studio/images/white-oak-kitchen.webp",
    className: "project project-wide",
  },
  {
    title: "Reeded Vanity",
    meta: "Custom bathroom · natural oak",
    image: "/studio/images/reeded-vanity.webp",
    className: "project project-tall",
  },
  {
    title: "White Oak Built-Ins",
    meta: "Architectural woodwork · made to fit",
    image: "/studio/images/white-oak-built-ins.webp",
    className: "project",
  },
  {
    title: "The Field Table",
    meta: "Solid wood · built by hand",
    image: "/studio/images/field-table.webp",
    className: "project",
  },
];

export default function Home() {
  return (
    <main className="studio-page">
      <StudioHeader home links={[{label:'Selected work',to:'/#work'},{label:'Process',to:'/#process'},{label:'About',to:'/#studio'},{label:'Shape your table ↗',to:'/configurator'}]} />

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Custom fine furniture &amp; cabinetry · Riverside, California</p>
          <h1>Made from trees.<br /><em>Made for life.</em></h1>
          <div className="hero-bottom">
            <p>Design-led cabinetry and custom heirloom furniture, built by hand for spaces that work beautifully in everyday life.</p>
            <a className="circle-link" href="#work" aria-label="Explore selected work">↓</a>
          </div>
        </div>
        <figure className="hero-image">
          <img src="/studio/images/reeded-vanity.webp" alt="From Trees reeded wood vanity with a stone top and brass faucet" />
          <figcaption>Reeded Vanity<br />Riverside, California</figcaption>
        </figure>
      </section>

      <section className="statement">
        <p className="eyebrow">Our point of view</p>
        <p className="statement-copy">We create custom cabinetry and furniture where thoughtful design, master craftsmanship, and real function come together—without shortcuts or surprises.</p>
      </section>

      <section className="work-section" id="work">
        <div className="section-heading">
          <div><p className="eyebrow">Selected work</p><h2>Built to belong.</h2></div>
          <p>From kitchens and built-ins to vanities and furniture, every project is approached with care, honesty, and a hands-on mindset.</p>
        </div>
        <div className="project-grid">
          {projects.map((project) => (
            <article className={project.className} key={project.title}>
              <div className="project-image"><img src={project.image} alt={project.title} /></div>
              <div className="project-info"><h3>{project.title}</h3><p>{project.meta}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="process-section" id="process">
        <div className="process-intro">
          <p className="eyebrow">From tree to table</p>
          <h2>Clear from concept<br />to <em>completion.</em></h2>
          <p>Open communication, detailed design, and practical guidance make the process collaborative and stress-free from the first conversation through installation.</p>
        </div>
        <div className="process-steps">
          {[
            ["01", "Consult & measure", "We learn about your family, your space, inspiration, must-haves, and the way the finished piece needs to function."],
            ["02", "Design & refine", "Detailed measurements, material selections, and 3D renderings let us resolve every detail before anything is built."],
            ["03", "Engineer & build", "With the design approved, we create production drawings, select quality materials, and build with precision in our Riverside shop."],
            ["04", "Deliver & fitment", "We coordinate a careful, professional installation or delivery with minimal disruption and close attention to the final fit."],
          ].map(([num, title, copy]) => (
            <article key={num}><span>{num}</span><div><h3>{title}</h3><p>{copy}</p></div></article>
          ))}
        </div>
      </section>

      <section className="workshop-band" id="studio">
        <img src="/studio/images/studio-cabinetry.webp" alt="Custom From Trees cabinetry in a refined California home" />
        <div className="workshop-note"><span>Family &amp; veteran owned</span><p>Local hands. Lasting work.</p></div>
      </section>

      <section className="table-study-cta">
        <div><p className="eyebrow">Table study</p><h2>Start with<br />a <em>sketch.</em></h2></div>
        <div><p>Explore timber, proportions, edge profiles, and base designs through a line-drawing study inspired by our real concept process.</p><a href="/configurator">Open the table configurator <span>↗</span></a></div>
      </section>

      <StudioFooter />
    </main>
  );
}
