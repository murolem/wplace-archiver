/**
 * Contains list of countries extracted from the leaderboard country dropdown.
 * 
 * There's no API endpoint to fetch these, they are included in the HTML response. 
 * So I just copied them over here.
 * 
 * To make a new copy, find the element in dom tree that contains the list of contries, select it and run:
 * @example
[...$0.children].map((e, i) => {
    const inner = e.innerText;
    const [flag, ...rest] = inner.split(" ");
    const country = rest.join(" ");

    return {
        index: i + 1,
        country,
        flag,
    }
})
 * 
 */

export type Country = {
    /** 1-based country index. */
    index: number,

    /** Plain country name. */
    country: string,

    /** Flag emoji. */
    flag: string
}

export const countries: Country[] = [
    {
        "index": 1,
        "country": "Afghanistan",
        "flag": "🇦🇫"
    },
    {
        "index": 2,
        "country": "Albania",
        "flag": "🇦🇱"
    },
    {
        "index": 3,
        "country": "Algeria",
        "flag": "🇩🇿"
    },
    {
        "index": 4,
        "country": "American Samoa",
        "flag": "🇦🇸"
    },
    {
        "index": 5,
        "country": "Andorra",
        "flag": "🇦🇩"
    },
    {
        "index": 6,
        "country": "Angola",
        "flag": "🇦🇴"
    },
    {
        "index": 7,
        "country": "Anguilla",
        "flag": "🇦🇮"
    },
    {
        "index": 8,
        "country": "Antarctica",
        "flag": "🇦🇶"
    },
    {
        "index": 9,
        "country": "Antigua and Barbuda",
        "flag": "🇦🇬"
    },
    {
        "index": 10,
        "country": "Argentina",
        "flag": "🇦🇷"
    },
    {
        "index": 11,
        "country": "Armenia",
        "flag": "🇦🇲"
    },
    {
        "index": 12,
        "country": "Aruba",
        "flag": "🇦🇼"
    },
    {
        "index": 13,
        "country": "Australia",
        "flag": "🇦🇺"
    },
    {
        "index": 14,
        "country": "Austria",
        "flag": "🇦🇹"
    },
    {
        "index": 15,
        "country": "Azerbaijan",
        "flag": "🇦🇿"
    },
    {
        "index": 16,
        "country": "Bahamas",
        "flag": "🇧🇸"
    },
    {
        "index": 17,
        "country": "Bahrain",
        "flag": "🇧🇭"
    },
    {
        "index": 18,
        "country": "Bangladesh",
        "flag": "🇧🇩"
    },
    {
        "index": 19,
        "country": "Barbados",
        "flag": "🇧🇧"
    },
    {
        "index": 20,
        "country": "Belarus",
        "flag": "🇧🇾"
    },
    {
        "index": 21,
        "country": "Belgium",
        "flag": "🇧🇪"
    },
    {
        "index": 22,
        "country": "Belize",
        "flag": "🇧🇿"
    },
    {
        "index": 23,
        "country": "Benin",
        "flag": "🇧🇯"
    },
    {
        "index": 24,
        "country": "Bermuda",
        "flag": "🇧🇲"
    },
    {
        "index": 25,
        "country": "Bhutan",
        "flag": "🇧🇹"
    },
    {
        "index": 26,
        "country": "Bolivia",
        "flag": "🇧🇴"
    },
    {
        "index": 27,
        "country": "Bonaire",
        "flag": "🇧🇶"
    },
    {
        "index": 28,
        "country": "Bosnia and Herzegovina",
        "flag": "🇧🇦"
    },
    {
        "index": 29,
        "country": "Botswana",
        "flag": "🇧🇼"
    },
    {
        "index": 30,
        "country": "Bouvet Island",
        "flag": "🇧🇻"
    },
    {
        "index": 31,
        "country": "Brazil",
        "flag": "🇧🇷"
    },
    {
        "index": 32,
        "country": "British Indian Ocean Territory",
        "flag": "🇮🇴"
    },
    {
        "index": 33,
        "country": "Brunei Darussalam",
        "flag": "🇧🇳"
    },
    {
        "index": 34,
        "country": "Bulgaria",
        "flag": "🇧🇬"
    },
    {
        "index": 35,
        "country": "Burkina Faso",
        "flag": "🇧🇫"
    },
    {
        "index": 36,
        "country": "Burundi",
        "flag": "🇧🇮"
    },
    {
        "index": 37,
        "country": "Cabo Verde",
        "flag": "🇨🇻"
    },
    {
        "index": 38,
        "country": "Cambodia",
        "flag": "🇰🇭"
    },
    {
        "index": 39,
        "country": "Cameroon",
        "flag": "🇨🇲"
    },
    {
        "index": 40,
        "country": "Canada",
        "flag": "🇨🇦"
    },
    {
        "index": 41,
        "country": "Cayman Islands",
        "flag": "🇰🇾"
    },
    {
        "index": 42,
        "country": "Central African Republic",
        "flag": "🇨🇫"
    },
    {
        "index": 43,
        "country": "Chad",
        "flag": "🇹🇩"
    },
    {
        "index": 44,
        "country": "Chile",
        "flag": "🇨🇱"
    },
    {
        "index": 45,
        "country": "China",
        "flag": "🇨🇳"
    },
    {
        "index": 46,
        "country": "Christmas Island",
        "flag": "🇨🇽"
    },
    {
        "index": 47,
        "country": "Cocos (Keeling) Islands",
        "flag": "🇨🇨"
    },
    {
        "index": 48,
        "country": "Colombia",
        "flag": "🇨🇴"
    },
    {
        "index": 49,
        "country": "Comoros",
        "flag": "🇰🇲"
    },
    {
        "index": 50,
        "country": "Congo",
        "flag": "🇨🇬"
    },
    {
        "index": 51,
        "country": "Cook Islands",
        "flag": "🇨🇰"
    },
    {
        "index": 52,
        "country": "Costa Rica",
        "flag": "🇨🇷"
    },
    {
        "index": 53,
        "country": "Croatia",
        "flag": "🇭🇷"
    },
    {
        "index": 54,
        "country": "Cuba",
        "flag": "🇨🇺"
    },
    {
        "index": 55,
        "country": "Curaçao",
        "flag": "🇨🇼"
    },
    {
        "index": 56,
        "country": "Cyprus",
        "flag": "🇨🇾"
    },
    {
        "index": 57,
        "country": "Czechia",
        "flag": "🇨🇿"
    },
    {
        "index": 58,
        "country": "Côte d'Ivoire",
        "flag": "🇨🇮"
    },
    {
        "index": 59,
        "country": "Denmark",
        "flag": "🇩🇰"
    },
    {
        "index": 60,
        "country": "Djibouti",
        "flag": "🇩🇯"
    },
    {
        "index": 61,
        "country": "Dominica",
        "flag": "🇩🇲"
    },
    {
        "index": 62,
        "country": "Dominican Republic",
        "flag": "🇩🇴"
    },
    {
        "index": 63,
        "country": "Ecuador",
        "flag": "🇪🇨"
    },
    {
        "index": 64,
        "country": "Egypt",
        "flag": "🇪🇬"
    },
    {
        "index": 65,
        "country": "El Salvador",
        "flag": "🇸🇻"
    },
    {
        "index": 66,
        "country": "Equatorial Guinea",
        "flag": "🇬🇶"
    },
    {
        "index": 67,
        "country": "Eritrea",
        "flag": "🇪🇷"
    },
    {
        "index": 68,
        "country": "Estonia",
        "flag": "🇪🇪"
    },
    {
        "index": 69,
        "country": "Eswatini",
        "flag": "🇸🇿"
    },
    {
        "index": 70,
        "country": "Ethiopia",
        "flag": "🇪🇹"
    },
    {
        "index": 71,
        "country": "Falkland Islands (Malvinas)",
        "flag": "🇫🇰"
    },
    {
        "index": 72,
        "country": "Faroe Islands",
        "flag": "🇫🇴"
    },
    {
        "index": 73,
        "country": "Fiji",
        "flag": "🇫🇯"
    },
    {
        "index": 74,
        "country": "Finland",
        "flag": "🇫🇮"
    },
    {
        "index": 75,
        "country": "France",
        "flag": "🇫🇷"
    },
    {
        "index": 76,
        "country": "French Guiana",
        "flag": "🇬🇫"
    },
    {
        "index": 77,
        "country": "French Polynesia",
        "flag": "🇵🇫"
    },
    {
        "index": 78,
        "country": "French Southern Territories",
        "flag": "🇹🇫"
    },
    {
        "index": 79,
        "country": "Gabon",
        "flag": "🇬🇦"
    },
    {
        "index": 80,
        "country": "Gambia",
        "flag": "🇬🇲"
    },
    {
        "index": 81,
        "country": "Georgia",
        "flag": "🇬🇪"
    },
    {
        "index": 82,
        "country": "Germany",
        "flag": "🇩🇪"
    },
    {
        "index": 83,
        "country": "Ghana",
        "flag": "🇬🇭"
    },
    {
        "index": 84,
        "country": "Gibraltar",
        "flag": "🇬🇮"
    },
    {
        "index": 85,
        "country": "Greece",
        "flag": "🇬🇷"
    },
    {
        "index": 86,
        "country": "Greenland",
        "flag": "🇬🇱"
    },
    {
        "index": 87,
        "country": "Grenada",
        "flag": "🇬🇩"
    },
    {
        "index": 88,
        "country": "Guadeloupe",
        "flag": "🇬🇵"
    },
    {
        "index": 89,
        "country": "Guam",
        "flag": "🇬🇺"
    },
    {
        "index": 90,
        "country": "Guatemala",
        "flag": "🇬🇹"
    },
    {
        "index": 91,
        "country": "Guernsey",
        "flag": "🇬🇬"
    },
    {
        "index": 92,
        "country": "Guinea",
        "flag": "🇬🇳"
    },
    {
        "index": 93,
        "country": "Guinea-Bissau",
        "flag": "🇬🇼"
    },
    {
        "index": 94,
        "country": "Guyana",
        "flag": "🇬🇾"
    },
    {
        "index": 95,
        "country": "Haiti",
        "flag": "🇭🇹"
    },
    {
        "index": 96,
        "country": "Heard Island and McDonald Islands",
        "flag": "🇭🇲"
    },
    {
        "index": 97,
        "country": "Honduras",
        "flag": "🇭🇳"
    },
    {
        "index": 98,
        "country": "Hong Kong",
        "flag": "🇭🇰"
    },
    {
        "index": 99,
        "country": "Hungary",
        "flag": "🇭🇺"
    },
    {
        "index": 100,
        "country": "Iceland",
        "flag": "🇮🇸"
    },
    {
        "index": 101,
        "country": "India",
        "flag": "🇮🇳"
    },
    {
        "index": 102,
        "country": "Indonesia",
        "flag": "🇮🇩"
    },
    {
        "index": 103,
        "country": "Iran",
        "flag": "🇮🇷"
    },
    {
        "index": 104,
        "country": "Iraq",
        "flag": "🇮🇶"
    },
    {
        "index": 105,
        "country": "Ireland",
        "flag": "🇮🇪"
    },
    {
        "index": 106,
        "country": "Isle of Man",
        "flag": "🇮🇲"
    },
    {
        "index": 107,
        "country": "Israel",
        "flag": "🇮🇱"
    },
    {
        "index": 108,
        "country": "Italy",
        "flag": "🇮🇹"
    },
    {
        "index": 109,
        "country": "Jamaica",
        "flag": "🇯🇲"
    },
    {
        "index": 110,
        "country": "Japan",
        "flag": "🇯🇵"
    },
    {
        "index": 111,
        "country": "Jersey",
        "flag": "🇯🇪"
    },
    {
        "index": 112,
        "country": "Jordan",
        "flag": "🇯🇴"
    },
    {
        "index": 113,
        "country": "Kazakhstan",
        "flag": "🇰🇿"
    },
    {
        "index": 114,
        "country": "Kenya",
        "flag": "🇰🇪"
    },
    {
        "index": 115,
        "country": "Kiribati",
        "flag": "🇰🇮"
    },
    {
        "index": 116,
        "country": "Kosovo",
        "flag": "🇽🇰"
    },
    {
        "index": 117,
        "country": "Kuwait",
        "flag": "🇰🇼"
    },
    {
        "index": 118,
        "country": "Kyrgyzstan",
        "flag": "🇰🇬"
    },
    {
        "index": 119,
        "country": "Laos",
        "flag": "🇱🇦"
    },
    {
        "index": 120,
        "country": "Latvia",
        "flag": "🇱🇻"
    },
    {
        "index": 121,
        "country": "Lebanon",
        "flag": "🇱🇧"
    },
    {
        "index": 122,
        "country": "Lesotho",
        "flag": "🇱🇸"
    },
    {
        "index": 123,
        "country": "Liberia",
        "flag": "🇱🇷"
    },
    {
        "index": 124,
        "country": "Libya",
        "flag": "🇱🇾"
    },
    {
        "index": 125,
        "country": "Liechtenstein",
        "flag": "🇱🇮"
    },
    {
        "index": 126,
        "country": "Lithuania",
        "flag": "🇱🇹"
    },
    {
        "index": 127,
        "country": "Luxembourg",
        "flag": "🇱🇺"
    },
    {
        "index": 128,
        "country": "Macao",
        "flag": "🇲🇴"
    },
    {
        "index": 129,
        "country": "Madagascar",
        "flag": "🇲🇬"
    },
    {
        "index": 130,
        "country": "Malawi",
        "flag": "🇲🇼"
    },
    {
        "index": 131,
        "country": "Malaysia",
        "flag": "🇲🇾"
    },
    {
        "index": 132,
        "country": "Maldives",
        "flag": "🇲🇻"
    },
    {
        "index": 133,
        "country": "Mali",
        "flag": "🇲🇱"
    },
    {
        "index": 134,
        "country": "Malta",
        "flag": "🇲🇹"
    },
    {
        "index": 135,
        "country": "Marshall Islands",
        "flag": "🇲🇭"
    },
    {
        "index": 136,
        "country": "Martinique",
        "flag": "🇲🇶"
    },
    {
        "index": 137,
        "country": "Mauritania",
        "flag": "🇲🇷"
    },
    {
        "index": 138,
        "country": "Mauritius",
        "flag": "🇲🇺"
    },
    {
        "index": 139,
        "country": "Mayotte",
        "flag": "🇾🇹"
    },
    {
        "index": 140,
        "country": "Mexico",
        "flag": "🇲🇽"
    },
    {
        "index": 141,
        "country": "Micronesia",
        "flag": "🇫🇲"
    },
    {
        "index": 142,
        "country": "Moldova",
        "flag": "🇲🇩"
    },
    {
        "index": 143,
        "country": "Monaco",
        "flag": "🇲🇨"
    },
    {
        "index": 144,
        "country": "Mongolia",
        "flag": "🇲🇳"
    },
    {
        "index": 145,
        "country": "Montenegro",
        "flag": "🇲🇪"
    },
    {
        "index": 146,
        "country": "Montserrat",
        "flag": "🇲🇸"
    },
    {
        "index": 147,
        "country": "Morocco",
        "flag": "🇲🇦"
    },
    {
        "index": 148,
        "country": "Mozambique",
        "flag": "🇲🇿"
    },
    {
        "index": 149,
        "country": "Myanmar",
        "flag": "🇲🇲"
    },
    {
        "index": 150,
        "country": "Namibia",
        "flag": "🇳🇦"
    },
    {
        "index": 151,
        "country": "Nauru",
        "flag": "🇳🇷"
    },
    {
        "index": 152,
        "country": "Nepal",
        "flag": "🇳🇵"
    },
    {
        "index": 153,
        "country": "Netherlands",
        "flag": "🇳🇱"
    },
    {
        "index": 154,
        "country": "New Caledonia",
        "flag": "🇳🇨"
    },
    {
        "index": 155,
        "country": "New Zealand",
        "flag": "🇳🇿"
    },
    {
        "index": 156,
        "country": "Nicaragua",
        "flag": "🇳🇮"
    },
    {
        "index": 157,
        "country": "Niger",
        "flag": "🇳🇪"
    },
    {
        "index": 158,
        "country": "Nigeria",
        "flag": "🇳🇬"
    },
    {
        "index": 159,
        "country": "Niue",
        "flag": "🇳🇺"
    },
    {
        "index": 160,
        "country": "Norfolk Island",
        "flag": "🇳🇫"
    },
    {
        "index": 161,
        "country": "North Korea",
        "flag": "🇰🇵"
    },
    {
        "index": 162,
        "country": "North Macedonia",
        "flag": "🇲🇰"
    },
    {
        "index": 163,
        "country": "Northern Mariana Islands",
        "flag": "🇲🇵"
    },
    {
        "index": 164,
        "country": "Norway",
        "flag": "🇳🇴"
    },
    {
        "index": 165,
        "country": "Oman",
        "flag": "🇴🇲"
    },
    {
        "index": 166,
        "country": "Pakistan",
        "flag": "🇵🇰"
    },
    {
        "index": 167,
        "country": "Palau",
        "flag": "🇵🇼"
    },
    {
        "index": 168,
        "country": "Palestine",
        "flag": "🇵🇸"
    },
    {
        "index": 169,
        "country": "Panama",
        "flag": "🇵🇦"
    },
    {
        "index": 170,
        "country": "Papua New Guinea",
        "flag": "🇵🇬"
    },
    {
        "index": 171,
        "country": "Paraguay",
        "flag": "🇵🇾"
    },
    {
        "index": 172,
        "country": "Peru",
        "flag": "🇵🇪"
    },
    {
        "index": 173,
        "country": "Philippines",
        "flag": "🇵🇭"
    },
    {
        "index": 174,
        "country": "Pitcairn",
        "flag": "🇵🇳"
    },
    {
        "index": 175,
        "country": "Poland",
        "flag": "🇵🇱"
    },
    {
        "index": 176,
        "country": "Portugal",
        "flag": "🇵🇹"
    },
    {
        "index": 177,
        "country": "Puerto Rico",
        "flag": "🇵🇷"
    },
    {
        "index": 178,
        "country": "Qatar",
        "flag": "🇶🇦"
    },
    {
        "index": 179,
        "country": "Republic of the Congo",
        "flag": "🇨🇩"
    },
    {
        "index": 180,
        "country": "Romania",
        "flag": "🇷🇴"
    },
    {
        "index": 181,
        "country": "Russia",
        "flag": "🇷🇺"
    },
    {
        "index": 182,
        "country": "Rwanda",
        "flag": "🇷🇼"
    },
    {
        "index": 183,
        "country": "Réunion",
        "flag": "🇷🇪"
    },
    {
        "index": 184,
        "country": "Saint Barthélemy",
        "flag": "🇧🇱"
    },
    {
        "index": 185,
        "country": "Saint Helena",
        "flag": "🇸🇭"
    },
    {
        "index": 186,
        "country": "Saint Kitts and Nevis",
        "flag": "🇰🇳"
    },
    {
        "index": 187,
        "country": "Saint Lucia",
        "flag": "🇱🇨"
    },
    {
        "index": 188,
        "country": "Saint Martin (French part)",
        "flag": "🇲🇫"
    },
    {
        "index": 189,
        "country": "Saint Pierre and Miquelon",
        "flag": "🇵🇲"
    },
    {
        "index": 190,
        "country": "Saint Vincent and the Grenadines",
        "flag": "🇻🇨"
    },
    {
        "index": 191,
        "country": "Samoa",
        "flag": "🇼🇸"
    },
    {
        "index": 192,
        "country": "San Marino",
        "flag": "🇸🇲"
    },
    {
        "index": 193,
        "country": "Sao Tome and Principe",
        "flag": "🇸🇹"
    },
    {
        "index": 194,
        "country": "Saudi Arabia",
        "flag": "🇸🇦"
    },
    {
        "index": 195,
        "country": "Senegal",
        "flag": "🇸🇳"
    },
    {
        "index": 196,
        "country": "Serbia",
        "flag": "🇷🇸"
    },
    {
        "index": 197,
        "country": "Seychelles",
        "flag": "🇸🇨"
    },
    {
        "index": 198,
        "country": "Sierra Leone",
        "flag": "🇸🇱"
    },
    {
        "index": 199,
        "country": "Singapore",
        "flag": "🇸🇬"
    },
    {
        "index": 200,
        "country": "Sint Maarten (Dutch part)",
        "flag": "🇸🇽"
    },
    {
        "index": 201,
        "country": "Slovakia",
        "flag": "🇸🇰"
    },
    {
        "index": 202,
        "country": "Slovenia",
        "flag": "🇸🇮"
    },
    {
        "index": 203,
        "country": "Solomon Islands",
        "flag": "🇸🇧"
    },
    {
        "index": 204,
        "country": "Somalia",
        "flag": "🇸🇴"
    },
    {
        "index": 205,
        "country": "South Africa",
        "flag": "🇿🇦"
    },
    {
        "index": 206,
        "country": "South Georgia and the South Sandwich Islands",
        "flag": "🇬🇸"
    },
    {
        "index": 207,
        "country": "South Korea",
        "flag": "🇰🇷"
    },
    {
        "index": 208,
        "country": "South Sudan",
        "flag": "🇸🇸"
    },
    {
        "index": 209,
        "country": "Spain",
        "flag": "🇪🇸"
    },
    {
        "index": 210,
        "country": "Sri Lanka",
        "flag": "🇱🇰"
    },
    {
        "index": 211,
        "country": "Sudan",
        "flag": "🇸🇩"
    },
    {
        "index": 212,
        "country": "Suriname",
        "flag": "🇸🇷"
    },
    {
        "index": 213,
        "country": "Svalbard and Jan Mayen",
        "flag": "🇸🇯"
    },
    {
        "index": 214,
        "country": "Sweden",
        "flag": "🇸🇪"
    },
    {
        "index": 215,
        "country": "Switzerland",
        "flag": "🇨🇭"
    },
    {
        "index": 216,
        "country": "Syrian Arab Republic",
        "flag": "🇸🇾"
    },
    {
        "index": 217,
        "country": "Taiwan",
        "flag": "🇹🇼"
    },
    {
        "index": 218,
        "country": "Tajikistan",
        "flag": "🇹🇯"
    },
    {
        "index": 219,
        "country": "Tanzania",
        "flag": "🇹🇿"
    },
    {
        "index": 220,
        "country": "Thailand",
        "flag": "🇹🇭"
    },
    {
        "index": 221,
        "country": "Timor-Leste",
        "flag": "🇹🇱"
    },
    {
        "index": 222,
        "country": "Togo",
        "flag": "🇹🇬"
    },
    {
        "index": 223,
        "country": "Tokelau",
        "flag": "🇹🇰"
    },
    {
        "index": 224,
        "country": "Tonga",
        "flag": "🇹🇴"
    },
    {
        "index": 225,
        "country": "Trinidad and Tobago",
        "flag": "🇹🇹"
    },
    {
        "index": 226,
        "country": "Tunisia",
        "flag": "🇹🇳"
    },
    {
        "index": 227,
        "country": "Turkmenistan",
        "flag": "🇹🇲"
    },
    {
        "index": 228,
        "country": "Turks and Caicos Islands",
        "flag": "🇹🇨"
    },
    {
        "index": 229,
        "country": "Tuvalu",
        "flag": "🇹🇻"
    },
    {
        "index": 230,
        "country": "Türkiye",
        "flag": "🇹🇷"
    },
    {
        "index": 231,
        "country": "Uganda",
        "flag": "🇺🇬"
    },
    {
        "index": 232,
        "country": "Ukraine",
        "flag": "🇺🇦"
    },
    {
        "index": 233,
        "country": "United Arab Emirates",
        "flag": "🇦🇪"
    },
    {
        "index": 234,
        "country": "United Kingdom",
        "flag": "🇬🇧"
    },
    {
        "index": 235,
        "country": "United States",
        "flag": "🇺🇸"
    },
    {
        "index": 236,
        "country": "United States Minor Outlying Islands",
        "flag": "🇺🇲"
    },
    {
        "index": 237,
        "country": "Uruguay",
        "flag": "🇺🇾"
    },
    {
        "index": 238,
        "country": "Uzbekistan",
        "flag": "🇺🇿"
    },
    {
        "index": 239,
        "country": "Vanuatu",
        "flag": "🇻🇺"
    },
    {
        "index": 240,
        "country": "Vatican City",
        "flag": "🇻🇦"
    },
    {
        "index": 241,
        "country": "Venezuela",
        "flag": "🇻🇪"
    },
    {
        "index": 242,
        "country": "Viet Nam",
        "flag": "🇻🇳"
    },
    {
        "index": 243,
        "country": "Virgin Islands",
        "flag": "🇻🇬"
    },
    {
        "index": 244,
        "country": "Virgin Islands",
        "flag": "🇻🇮"
    },
    {
        "index": 245,
        "country": "Wallis and Futuna",
        "flag": "🇼🇫"
    },
    {
        "index": 246,
        "country": "Western Sahara",
        "flag": "🇪🇭"
    },
    {
        "index": 247,
        "country": "Yemen",
        "flag": "🇾🇪"
    },
    {
        "index": 248,
        "country": "Zambia",
        "flag": "🇿🇲"
    },
    {
        "index": 249,
        "country": "Zimbabwe",
        "flag": "🇿🇼"
    },
    {
        "index": 250,
        "country": "Åland Islands",
        "flag": "🇦🇽"
    },
    {
        "index": 251,
        "country": "Canary Islands",
        "flag": "🇮🇨"
    }
]