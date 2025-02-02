/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  // By default, Docusaurus generates a sidebar from the docs folder structure
  // tutorialSidebar: [{type: 'autogenerated', dirName: '.'}],

  // But you can create a sidebar manually

  tutorialSidebar: [
    {
      type: "doc",
      label: "Introduction",
      id: "intro",
    },
    {
      type: "doc",
      label: "Quickstart",
      id: "quickstart",
    },
    {
      type: "category",
      label: "Extensions",
      link: {
        type: "generated-index",
        title: "Poozle Supported extensions",
        description:
          "For every extension that Poozle supports we maintain a small wiki with all our learnings. Feel free to contribute yours as well!",
        slug: "/extensions",
      },
      items: [
        {
          type: "doc",
          id: "extensions/github",
          label: "Github",
        },
      ],
    },
    {
      type: "category",
      label: "Building extension",
      items: [
        {
          type: "doc",
          id: "building_extension/overview",
          label: "Overview",
        },
      ],
    },
    {
      type: "category",
      label: "Understanding Poozle",
      items: [
        {
          type: "doc",
          id: "understanding_poozle/protocol",
          label: "Protocol",
        },
        {
          type: "doc",
          id: "understanding_poozle/architecture",
          label: "Architecture overview",
        },
      ],
    },
    {
      type: "category",
      label: "Contributing to Poozle",
      items: [
        {
          type: "doc",
          id: "contributing/contributing",
          label: "Contributing to Poozle",
        },
        {
          type: "doc",
          id: "contributing/code_of_conduct",
          label: "Code of Conduct",
        },
      ],
    },
  ],
};

module.exports = sidebars;
