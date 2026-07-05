export type TeamOptixAboutSection = {
  title: string;
  quote?: string;
  paragraphs: string[];
};

export type TeamOptixAboutContent = {
  hero: {
    kicker: string;
    title: string;
    intro: string[];
  };
  sections: TeamOptixAboutSection[];
};

export const teamOptixAbout: TeamOptixAboutContent = {
  hero: {
    kicker: "About Team Optix",
    title: "Built by an operator. Built for operators.",
    intro: [
      "There are companies that begin with an idea. Team Optix began with a problem.",
      "Not a theoretical problem discussed in a conference room or tucked into a business plan, but the kind that follows you home after another twelve-hour day. The kind that sits beside you on the drive to work because you already know tomorrow's decisions are waiting before you've even unlocked the door.",
    ],
  },

  sections: [
    {
      title: "The operation came first.",
      paragraphs: [
        "Running a FedEx Pickup & Delivery business means living inside constant motion. Routes change. Trucks break. People call off. Payroll has to be right. Customers expect service. Compliance never sleeps. Every day brings another hundred decisions, and every one of them depends on understanding what is actually happening inside the operation.",
        "The information existed. The understanding did not.",
        "Like many contractors, I found myself surrounded by software that could answer individual questions but couldn't explain the business. One system knew payroll. Another knew dispatch. Another held service data. Reports arrived at different times from different places, and every meaningful decision required stitching together pieces that were never built to fit.",
      ],
    },
    {
      title: "Before Insight, there were spreadsheets.",
      paragraphs: [
        "So I started building. Not an application. Not a company. A spreadsheet.",
        "Then another. Then another.",
        "Over time those spreadsheets became something far larger than I had ever intended. They were no longer just tracking information; they were connecting it. Data flowed between workspaces. Reports became linked. Historical context emerged. Different people could see different parts of the business because the right information belonged in the right hands, and clarity without security is not clarity at all.",
        "For years that system grew alongside the operation. Every new challenge became another improvement. Every lesson learned in the business found its way into another worksheet, another automation, another connection.",
        "It worked remarkably well. It also demanded everything from the person maintaining it.",
      ],
    },
    {
      title: "The turning point.",
      quote:
        "Ted, nobody spends four years making spreadsheets do what you're doing. It's time to think about turning this into an application.",
      paragraphs: [
        "At first I resisted. I had invested years into that system. I believed in it. Eventually I had to admit that the spreadsheets weren't the product. They had simply been the first language the product was written in.",
        "The real value wasn't hidden inside formulas or scripts. It was the operational thinking they represented: years of decisions, mistakes, and learning what operators actually need—not in theory, but on Tuesday morning when two trucks are down, payroll closes tomorrow, and service still has to happen.",
        "That realization became Team Optix.",
      ],
    },
    {
      title: "Why Insight.",
      paragraphs: [
        "We didn't set out to build software. We set out to preserve what the operation had taught us and place it into something stronger, more reliable, and capable of helping people beyond our own business.",
        "Insight is the first expression of that vision. Every workspace, report, conversation, and automation exists because it solved a real operational problem before it ever became software.",
        "Planning. Dispatch. Payroll. Hiring. Operations Intelligence. Automation.",
      ],
    },
    {
      title: "Why FedEx Pickup & Delivery.",
      paragraphs: [
        "We chose to begin here because this is where the journey started. It remains one of the most demanding operational environments anywhere.",
        "If software can create clarity here, we believe it can create clarity anywhere disciplined execution matters.",
      ],
    },
    {
      title: "Looking forward.",
      paragraphs: [
        "Insight is our first product, but it is not our destination.",
        "Team Optix exists to build practical software for operational businesses—software that respects the people doing the work, values truth over appearances, and turns complexity into understanding instead of adding to it.",
        "What started as one operator trying to make sense of his own business has become something larger. Not because we set out to build a software company, but because the work itself showed us there was a better way.",
      ],
    },
  ],
};
