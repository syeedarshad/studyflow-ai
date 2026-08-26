import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import ProductReveal from "./components/ProductReveal";
import FeatureStory from "./components/FeatureStory";
import WorkflowSection from "./components/WorkflowSection";
import AISection from "./components/AISection";
import DownloadSection from "./components/DownloadSection";
import Requirements from "./components/Requirements";
import GithubSection from "./components/GithubSection";
import FinalCTA from "./components/FinalCTA";
import Footer from "./components/Footer";
import "./styles/global.css";
import "./styles/animations.css";
import "./styles/components.css";

function Loader() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5, ease: "easeInOut" } }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "var(--color-bg)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      aria-hidden
    >
      <motion.span
        initial={{ opacity: 0, letterSpacing: "0.6em", filter: "blur(6px)" }}
        animate={{ opacity: 1, letterSpacing: "0.18em", filter: "blur(0px)" }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 20,
          textTransform: "uppercase",
          color: "var(--color-text)",
        }}
      >
        Studyflow
      </motion.span>
    </motion.div>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <AnimatePresence>{loading && <Loader key="loader" />}</AnimatePresence>
      <Navbar />
      <main className="grain">
        <Hero />
        <ProductReveal />
        <FeatureStory />
        <WorkflowSection />
        <AISection />
        <DownloadSection />
        <Requirements />
        <GithubSection />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
