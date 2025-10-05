/**
 * Legal Metadata Extractor
 * Extracts structured legal information from judgment documents
 */

class LegalMetadataExtractor {
  /**
   * Extract legal metadata from document content
   * @param {Object} document - Document object with pageContent, title, etc.
   * @returns {Object|null} Extracted legal metadata or null
   */
  static extract(document) {
    try {
      const content = document.pageContent || "";
      const title = document.title || "";
      
      if (!content || content.length < 100) {
        console.log(`[LegalMetadata] Content too short to extract metadata`);
        return null;
      }

      const metadata = {
        title: this.extractTitle(title, content),
        citation: this.extractCitation(content),
        case_id: this.extractCaseId(content),
        cnr: this.extractCNR(content),
        judge: this.extractJudge(content),
        court: this.extractCourt(content),
        year: this.extractYear(content),
        case_type: this.extractCaseType(content, title),
        jurisdiction: this.extractJurisdiction(content),
        bench_type: this.extractBenchType(content),
        petitioner: this.extractParty(content, "petitioner"),
        respondent: this.extractParty(content, "respondent"),
        decision_date: this.extractDecisionDate(content),
        filing_date: this.extractFilingDate(content),
        keywords: this.extractKeywords(content),
        acts_cited: this.extractActsCited(content),
        cases_cited: this.extractCasesCited(content),
      };

      // Filter out null/undefined values
      const cleanedMetadata = {};
      for (const [key, value] of Object.entries(metadata)) {
        if (value !== null && value !== undefined && value !== "") {
          cleanedMetadata[key] = value;
        }
      }

      // Only return if we extracted meaningful data
      const hasData = Object.keys(cleanedMetadata).length > 3;
      if (!hasData) {
        console.log(`[LegalMetadata] Insufficient metadata extracted`);
        return null;
      }

      console.log(`[LegalMetadata] Extracted ${Object.keys(cleanedMetadata).length} fields`);
      return cleanedMetadata;
    } catch (error) {
      console.error(`[LegalMetadata] Extraction error:`, error.message);
      return null;
    }
  }

  /**
   * Extract case title
   */
  static extractTitle(title, content) {
    // Try from filename first
    if (title && !title.endsWith(".pdf")) {
      return title.substring(0, 500);
    }

    // Try from content - look for "APPELLANT" and "RESPONDENT" patterns
    const titlePattern = /([A-Z][A-Z\s\.&,'-]+)\s*(?:\.{3,5}|vs\.?|v\.)\s*(?:APPELLANT|PETITIONER)/i;
    const match = content.match(titlePattern);
    if (match) {
      const extracted = match[1].trim();
      // Look for respondent
      const respondentPattern = /(?:VERSUS|vs\.?|v\.)\s*([A-Z][A-Z\s\.&,'-]+)\s*(?:\.{3,5}|RESPONDENT)/i;
      const respMatch = content.match(respondentPattern);
      if (respMatch) {
        return `${extracted} vs ${respMatch[1].trim()}`.substring(0, 500);
      }
      return extracted.substring(0, 500);
    }

    return title ? title.substring(0, 500) : null;
  }

  /**
   * Extract citation (e.g., "2024 INSC 400", "2023 1 SCC 123")
   */
  static extractCitation(content) {
    const patterns = [
      /(\d{4}\s+INSC\s+\d+)/i,
      /(\d{4}\s+\d+\s+SCC\s+\d+)/i,
      /(\d{4}\s+\d+\s+SCR\s+\d+)/i,
      /(\d{4}\s+\d+\s+[A-Z]+\s+\d+)/,
      /(\(\d{4}\)\s+\d+\s+SCC\s+\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim().substring(0, 100);
      }
    }

    return null;
  }

  /**
   * Extract case ID/number
   */
  static extractCaseId(content) {
    const patterns = [
      /(?:Criminal Appeal|Civil Appeal|SLP|Writ Petition|Special Leave Petition).*?(?:No\.|Number)\s*[:\.]?\s*(\d+[\/-]\d+)/i,
      /Case\s*(?:No\.|Number)\s*[:\.]?\s*([A-Z0-9\/-]+)/i,
      /Crl\.\s*A\.\s*No\.\s*(\d+[\/-]\d+)/i,
      /C\.A\.\s*No\.\s*(\d+[\/-]\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim().substring(0, 100);
      }
    }

    return null;
  }

  /**
   * Extract CNR (Case Number Registry)
   */
  static extractCNR(content) {
    const pattern = /CNR\s*[:\.]?\s*([A-Z]{4}\d{14})/i;
    const match = content.match(pattern);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract judge name(s)
   */
  static extractJudge(content) {
    const patterns = [
      /(?:CORAM|BEFORE|HONOURABLE|HON'BLE)[:\s]+(?:MR\.|MS\.|MRS\.)?\s*(?:JUSTICE|J\.)\s+([A-Z][A-Z\s\.]+)/i,
      /(?:J\.|JUSTICE)\s+([A-Z][A-Z\s\.]+?)(?:\s+J\.|\s+AND)/i,
    ];

    const judges = new Set();
    for (const pattern of patterns) {
      const matches = content.matchAll(new RegExp(pattern.source, 'gi'));
      for (const match of matches) {
        if (match[1]) {
          const judge = match[1].trim().replace(/\s+/g, ' ');
          if (judge.length > 3 && judge.length < 100) {
            judges.add(judge);
          }
        }
      }
    }

    return judges.size > 0 ? Array.from(judges).slice(0, 3).join(", ").substring(0, 200) : null;
  }

  /**
   * Extract court name
   */
  static extractCourt(content) {
    const patterns = [
      /IN THE (SUPREME COURT OF INDIA)/i,
      /IN THE (HIGH COURT OF [A-Z\s]+)/i,
      /IN THE ([\w\s]+ HIGH COURT)/i,
      /(SUPREME COURT OF INDIA)/i,
      /(HIGH COURT OF [A-Z\s]+)/i,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim().substring(0, 200);
      }
    }

    return null;
  }

  /**
   * Extract year
   */
  static extractYear(content) {
    // Try from citation first
    const citationPattern = /(\d{4})\s+(?:INSC|\d+\s+SCC)/i;
    const citationMatch = content.match(citationPattern);
    if (citationMatch) {
      const year = parseInt(citationMatch[1]);
      if (year >= 1950 && year <= new Date().getFullYear() + 1) {
        return year;
      }
    }

    // Try from date patterns
    const datePatterns = [
      /(?:Date|Dated|Decided on|Pronounced on)[:\s]+\d{1,2}[\/\-\.]\d{1,2}[\/\-\.](\d{4})/i,
      /(\d{4})\s*$/m, // Year at end of line
    ];

    for (const pattern of datePatterns) {
      const match = content.match(pattern);
      if (match) {
        const year = parseInt(match[1]);
        if (year >= 1950 && year <= new Date().getFullYear() + 1) {
          return year;
        }
      }
    }

    return null;
  }

  /**
   * Extract case type
   */
  static extractCaseType(content, title) {
    const types = [
      { pattern: /Criminal Appeal/i, type: "Criminal Appeal" },
      { pattern: /Civil Appeal/i, type: "Civil Appeal" },
      { pattern: /Writ Petition/i, type: "Writ Petition" },
      { pattern: /Special Leave Petition/i, type: "Special Leave Petition" },
      { pattern: /Review Petition/i, type: "Review Petition" },
      { pattern: /Transfer Petition/i, type: "Transfer Petition" },
      { pattern: /Contempt Petition/i, type: "Contempt Petition" },
      { pattern: /Public Interest Litigation|PIL/i, type: "PIL" },
      { pattern: /Habeas Corpus/i, type: "Habeas Corpus" },
      { pattern: /Bail Application/i, type: "Bail Application" },
    ];

    const searchText = content.substring(0, 2000) + " " + title;
    for (const { pattern, type } of types) {
      if (pattern.test(searchText)) {
        return type;
      }
    }

    return null;
  }

  /**
   * Extract jurisdiction
   */
  static extractJurisdiction(content) {
    const patterns = [
      /(CRIMINAL APPELLATE JURISDICTION)/i,
      /(CIVIL APPELLATE JURISDICTION)/i,
      /(ORIGINAL JURISDICTION)/i,
      /(CRIMINAL ORIGINAL JURISDICTION)/i,
      /(CIVIL ORIGINAL JURISDICTION)/i,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim().substring(0, 100);
      }
    }

    return null;
  }

  /**
   * Extract bench type
   */
  static extractBenchType(content) {
    if (/Constitution Bench/i.test(content)) return "Constitution Bench";
    if (/Five[- ]Judge Bench|5[- ]Judge Bench/i.test(content)) return "5-Judge Bench";
    if (/Three[- ]Judge Bench|3[- ]Judge Bench/i.test(content)) return "3-Judge Bench";
    if (/Division Bench/i.test(content)) return "Division Bench";
    if (/Single Bench/i.test(content)) return "Single Bench";
    return null;
  }

  /**
   * Extract party names (petitioner or respondent)
   */
  static extractParty(content, partyType) {
    const label = partyType === "petitioner" ? "(?:APPELLANT|PETITIONER)" : "RESPONDENT";
    const pattern = new RegExp(`([A-Z][A-Z\\s\\.&,'-]+?)\\s*\\.{3,5}\\s*${label}`, "i");
    const match = content.match(pattern);
    if (match) {
      return match[1].trim().substring(0, 200);
    }
    return null;
  }

  /**
   * Extract decision/judgment date
   */
  static extractDecisionDate(content) {
    const patterns = [
      /(?:Decided on|Pronounced on|Date of (?:Judgment|Decision))[:\s]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
      /(?:NEW DELHI|DELHI)[;,]\s*([A-Z]+\s+\d{1,2},?\s+\d{4})/i,
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})$/m, // Date at end of line
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return this.normalizeDate(match[1]);
      }
    }

    return null;
  }

  /**
   * Extract filing date
   */
  static extractFilingDate(content) {
    const pattern = /(?:Filed on|Date of Filing)[:\s]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i;
    const match = content.match(pattern);
    return match ? this.normalizeDate(match[1]) : null;
  }

  /**
   * Extract keywords from content
   */
  static extractKeywords(content) {
    const legalTerms = [
      "bail", "habeas corpus", "writ", "mandamus", "certiorari", "prohibition",
      "quo warranto", "fundamental rights", "article 21", "article 14", "article 19",
      "constitution", "criminal", "civil", "appeal", "revision", "evidence",
      "witness", "prosecution", "defence", "conviction", "acquittal", "sentence",
      "jurisdiction", "precedent", "doctrine", "natural justice", "due process"
    ];

    const found = new Set();
    const lowerContent = content.toLowerCase();
    
    for (const term of legalTerms) {
      if (lowerContent.includes(term)) {
        found.add(term);
        if (found.size >= 10) break; // Limit to 10 keywords
      }
    }

    return found.size > 0 ? Array.from(found) : null;
  }

  /**
   * Extract cited acts
   */
  static extractActsCited(content) {
    const actPattern = /(?:Section\s+\d+[A-Z]?(?:\(\d+\))?(?:\s*(?:to|and)\s*\d+[A-Z]?)?)\s+(?:of\s+(?:the\s+)?)?([A-Z][A-Za-z\s,]+Act,?\s+\d{4})/g;
    const acts = new Set();
    
    const matches = content.matchAll(actPattern);
    for (const match of matches) {
      if (match[1]) {
        acts.add(match[1].trim());
        if (acts.size >= 10) break;
      }
    }

    // Also look for standalone act names
    const standalonePattern = /\b([A-Z][A-Za-z\s]+(?:Act|Code),?\s+\d{4})\b/g;
    const standaloneMatches = content.matchAll(standalonePattern);
    for (const match of standaloneMatches) {
      acts.add(match[1].trim());
      if (acts.size >= 10) break;
    }

    return acts.size > 0 ? Array.from(acts).slice(0, 10) : null;
  }

  /**
   * Extract cited cases
   */
  static extractCasesCited(content) {
    const casePattern = /([A-Z][A-Za-z\s\.&]+)\s+v\.\s+([A-Z][A-Za-z\s\.&]+)\s*(?:\(\d{4}\))?\s*\d+\s+[A-Z]+\s+\d+/g;
    const cases = new Set();
    
    const matches = content.matchAll(casePattern);
    for (const match of matches) {
      cases.add(match[0].trim());
      if (cases.size >= 10) break;
    }

    return cases.size > 0 ? Array.from(cases).slice(0, 10) : null;
  }

  /**
   * Normalize date to ISO format
   */
  static normalizeDate(dateStr) {
    try {
      // Handle different date formats
      let normalizedDate = dateStr;
      
      // Handle DD.MM.YYYY format (common in Indian legal documents)
      if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split('.');
        normalizedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      // Handle DD/MM/YYYY format
      else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split('/');
        normalizedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      // Handle DD-MM-YYYY format
      else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split('-');
        normalizedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      // Handle MONTH DD, YYYY format (e.g., "SEPTEMBER 13, 2024")
      else if (/^[A-Z]+\s+\d{1,2},\s+\d{4}$/.test(dateStr)) {
        const [month, day, year] = dateStr.replace(',', '').split(' ');
        const monthMap = {
          'JANUARY': '01', 'FEBRUARY': '02', 'MARCH': '03', 'APRIL': '04',
          'MAY': '05', 'JUNE': '06', 'JULY': '07', 'AUGUST': '08',
          'SEPTEMBER': '09', 'OCTOBER': '10', 'NOVEMBER': '11', 'DECEMBER': '12'
        };
        const monthNum = monthMap[month.toUpperCase()];
        if (monthNum) {
          normalizedDate = `${year}-${monthNum}-${day.padStart(2, '0')}`;
        }
      }
      
      // Validate the date
      const date = new Date(normalizedDate);
      if (!isNaN(date.getTime()) && date.getFullYear() >= 1800 && date.getFullYear() <= 2200) {
        return normalizedDate;
      }
    } catch (error) {
      console.warn(`[LegalMetadata] Date parsing failed for: ${dateStr}`);
    }
    
    // Return null for invalid dates instead of malformed string
    return null;
  }
}

module.exports = { LegalMetadataExtractor };

