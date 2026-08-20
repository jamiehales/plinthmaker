export interface HelpSection {
  title: string
  body: string
}

export const HELP_TITLE = 'This week we\'re mostlymaking.plinths'

export const HELP_INTRO =
  'A simple free plinth generator designed for resin printing. I made this tool primarily for resin printing plinths for my own use. I\'ve printed multiple configurations with the default settings with success, but YMMV - adjust the support settings as needed! All STL generation is done locally in your browser.'

export const HELP_SECTIONS: HelpSection[] = [
  {
    title: 'Hollowing',
    body: 'Support hollowing for larger plinths. Use this to save resin (or simply make them actually printable). There is a suction cup hole by default - I haven\'t test printed anything without it.',
  },
  {
    title: 'Chamfer / Fillet',
    body: 'Reduce the amount of sanding you have to do by pre-filleting or chamfering the edges.',
  },
  {
    title: 'Trim',
    body: 'A lot of common router profiles are included, or make custom trim profiles (no saving of trim profiles yet, may add that soon).',
  },
  {
    title: 'Drill Jig',
    body: 'I\'ve added this to make drilling a plinth easier - or you can use it on other purchased cast resin/wood plinths. I tend to add a small 2mm pilot hole instead.',
  },
  {
    title: 'Supports',
    body: 'Auto generated supports for resin printers. The defaults are the values I use, but all parameters are adjustable for your own printing needs!',
  },
  {
    title: 'High Resolution STLs',
    body: 'The STL will be generated at the resolution you select - this is primarily useful to keep the trim or ellipsoid plinths without any stepping.',
  }
]