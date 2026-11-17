import type { ShelfBook } from "./books";

export interface PublicShelf {
  id: string;
  name: string;
  note: string;
  books: ShelfBook[];
}

interface Listing {
  id: string;
  title: string;
  author: string;
  year: number;
  coverId: number;
}

function shelf(id: string, name: string, note: string, listings: Listing[]): PublicShelf {
  return {
    id,
    name,
    note,
    books: listings.map((book, index) => ({
      ...book,
      savedAt: (listings.length - index) * 1000,
    })),
  };
}

export const publicShelves: PublicShelf[] = [
  shelf(
    "top-rated",
    "Top rated",
    "Widely recognized books that stay at the top of readers' lists.",
    [
      { id: "/works/OL3140822W", title: "To Kill a Mockingbird", author: "Harper Lee", year: 1960, coverId: 14351077 },
      { id: "/works/OL1168083W", title: "Nineteen Eighty-Four", author: "George Orwell", year: 1949, coverId: 9267242 },
      { id: "/works/OL66554W", title: "Pride and Prejudice", author: "Jane Austen", year: 1813, coverId: 14348537 },
      { id: "/works/OL468431W", title: "The Great Gatsby", author: "F. Scott Fitzgerald", year: 1925, coverId: 15144216 },
      { id: "/works/OL274505W", title: "One Hundred Years of Solitude", author: "Gabriel García Márquez", year: 1967, coverId: 10499988 },
      { id: "/works/OL50548W", title: "Beloved", author: "Toni Morrison", year: 1987, coverId: 8261367 },
      { id: "/works/OL166894W", title: "Crime and Punishment", author: "Fyodor Dostoevsky", year: 1866, coverId: 14853945 },
      { id: "/works/OL3335245W", title: "The Catcher in the Rye", author: "J. D. Salinger", year: 1951, coverId: 14577326 },
    ],
  ),
  shelf(
    "nyt-2025",
    "New York Times bestsellers, 2025",
    "Among the books that spent the most weeks on the New York Times hardcover fiction list in 2025.",
    [
      { id: "/works/OL29226517W", title: "Fourth Wing", author: "Rebecca Yarros", year: 2023, coverId: 14407898 },
      { id: "/works/OL17116910W", title: "The Nightingale", author: "Kristin Hannah", year: 2015, coverId: 8314147 },
      { id: "/works/OL36506504W", title: "James", author: "Percival Everett", year: 2024, coverId: 15094964 },
      { id: "/works/OL37247638W", title: "The Women", author: "Kristin Hannah", year: 2024, coverId: 14821539 },
      { id: "/works/OL42394587W", title: "Great Big Beautiful Life", author: "Emily Henry", year: 2025, coverId: 14861424 },
      { id: "/works/OL42412330W", title: "Atmosphere", author: "Taylor Jenkins Reid", year: 2025, coverId: 15098710 },
      { id: "/works/OL41942876W", title: "Never Flinch", author: "Stephen King", year: 2025, coverId: 14825714 },
      { id: "/works/OL42543873W", title: "Alchemised", author: "SenLinYu", year: 2025, coverId: 15137810 },
    ],
  ),
  shelf(
    "fantasy",
    "Fantasy",
    "The first book of a popular fantasy series.",
    [
      { id: "/works/OL27482W", title: "The Hobbit", author: "J.R.R. Tolkien", year: 1937, coverId: 14627509 },
      { id: "/works/OL82563W", title: "Harry Potter and the Philosopher's Stone", author: "J. K. Rowling", year: 1997, coverId: 15155833 },
      { id: "/works/OL257943W", title: "A Game of Thrones", author: "George R. R. Martin", year: 1996, coverId: 9269962 },
      { id: "/works/OL8479867W", title: "The Name of the Wind", author: "Patrick Rothfuss", year: 2007, coverId: 11480483 },
      { id: "/works/OL5738148W", title: "The Final Empire", author: "Brandon Sanderson", year: 2006, coverId: 14658160 },
      { id: "/works/OL15358691W", title: "The Way of Kings", author: "Brandon Sanderson", year: 2010, coverId: 14658316 },
      { id: "/works/OL71037W", title: "The Lion, the Witch and the Wardrobe", author: "C. S. Lewis", year: 1950, coverId: 8441376 },
      { id: "/works/OL2707183W", title: "Assassin's Apprentice", author: "Robin Hobb", year: 1995, coverId: 13454118 },
    ],
  ),
  shelf(
    "mystery",
    "Mystery",
    "The first book of a popular mystery series.",
    [
      { id: "/works/OL472715W", title: "The Mysterious Affair at Styles", author: "Agatha Christie", year: 1920, coverId: 13699667 },
      { id: "/works/OL262496W", title: "A Study in Scarlet", author: "Arthur Conan Doyle", year: 1887, coverId: 13405534 },
      { id: "/works/OL5784622W", title: "The Girl with the Dragon Tattoo", author: "Stieg Larsson", year: 2005, coverId: 9274740 },
      { id: "/works/OL2435522W", title: "The No. 1 Ladies' Detective Agency", author: "Alexander McCall Smith", year: 1998, coverId: 213299 },
      { id: "/works/OL16806416W", title: "The Cuckoo's Calling", author: "Robert Galbraith", year: 2013, coverId: 7261207 },
      { id: "/works/OL7989979W", title: "In the Woods", author: "Tana French", year: 2007, coverId: 1474730 },
      { id: "/works/OL8475913W", title: "Still Life", author: "Louise Penny", year: 2005, coverId: 1170673 },
    ],
  ),
  shelf(
    "science-fiction",
    "Science fiction",
    "The first book of a popular science fiction series.",
    [
      { id: "/works/OL893414W", title: "Dune", author: "Frank Herbert", year: 1965, coverId: 11481354 },
      { id: "/works/OL46125W", title: "Foundation", author: "Isaac Asimov", year: 1951, coverId: 14612610 },
      { id: "/works/OL49488W", title: "Ender's Game", author: "Orson Scott Card", year: 1985, coverId: 12996033 },
      { id: "/works/OL5735363W", title: "The Hunger Games", author: "Suzanne Collins", year: 2008, coverId: 12646537 },
      { id: "/works/OL27258W", title: "Neuromancer", author: "William Gibson", year: 1984, coverId: 283860 },
      { id: "/works/OL1963268W", title: "Hyperion", author: "Dan Simmons", year: 1989, coverId: 380332 },
      { id: "/works/OL17076473W", title: "Red Rising", author: "Pierce Brown", year: 2014, coverId: 8407136 },
      { id: "/works/OL2163649W", title: "The Hitchhiker's Guide to the Galaxy", author: "Douglas Adams", year: 1979, coverId: 12986869 },
    ],
  ),
  shelf(
    "horror",
    "Horror",
    "The first book of a popular horror series.",
    [
      { id: "/works/OL77826W", title: "Interview with the Vampire", author: "Anne Rice", year: 1976, coverId: 8401488 },
      { id: "/works/OL81633W", title: "The Shining", author: "Stephen King", year: 1977, coverId: 12376585 },
      { id: "/works/OL81599W", title: "The Talisman", author: "Stephen King and Peter Straub", year: 1984, coverId: 14651566 },
      { id: "/works/OL15168588W", title: "The Passage", author: "Justin Cronin", year: 2010, coverId: 8261369 },
      { id: "/works/OL3552895W", title: "The Strain", author: "Guillermo del Toro and Chuck Hogan", year: 2009, coverId: 10665468 },
      { id: "/works/OL461936W", title: "Guilty Pleasures", author: "Laurell K. Hamilton", year: 1993, coverId: 272344 },
      { id: "/works/OL82374W", title: "Dead Until Dark", author: "Charlaine Harris", year: 2001, coverId: 6399102 },
    ],
  ),
  shelf(
    "romance",
    "Romance",
    "The first book of a popular romance series.",
    [
      { id: "/works/OL554620W", title: "The Duke and I", author: "Julia Quinn", year: 2000, coverId: 6492549 },
      { id: "/works/OL3261155W", title: "Outlander", author: "Diana Gabaldon", year: 1991, coverId: 14428230 },
      { id: "/works/OL5720023W", title: "Twilight", author: "Stephenie Meyer", year: 2005, coverId: 12641977 },
      { id: "/works/OL111486W", title: "Vision in White", author: "Nora Roberts", year: 2009, coverId: 6028240 },
      { id: "/works/OL5091273W", title: "Dark Lover", author: "J. R. Ward", year: 2005, coverId: 293803 },
      { id: "/works/OL16336633W", title: "Fifty Shades of Grey", author: "E. L. James", year: 2011, coverId: 12648183 },
      { id: "/works/OL4331834W", title: "Secrets of a Summer Night", author: "Lisa Kleypas", year: 2004, coverId: 21652 },
    ],
  ),
];

const byId = new Map(publicShelves.map((item) => [item.id, item]));

export function publicShelf(id: string): PublicShelf | null {
  return byId.get(id) ?? null;
}

export function publicHref(id: string): string {
  return `/public?id=${encodeURIComponent(id)}`;
}
