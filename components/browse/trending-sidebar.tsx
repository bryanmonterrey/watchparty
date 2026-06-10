"use client";

import React from "react";
import { motion } from "framer-motion";

export const NEWS = [
    { headline: "Nike Announces Release of Patent Leather Black Air Force 1 Sneakers for Formal Wear with Suits", category: "Other", posts: "2,811" },
    { headline: "Google NotebookLM Rolls Out Cinematic Video Overviews to 100% of Pro Users in English", category: "News", posts: "90" },
    { headline: "Palm Beach Pete Clears Up Viral Epstein Mix-Up", category: "Entertainment", posts: "2,127" },
    { headline: "Solana Network Processes Record 65,000 Transactions Per Second During Weekend Surge", category: "Crypto", posts: "45,100" },
    { headline: "Real Madrid Confirms Mbappé Injury Ahead of Champions League Quarter-Final", category: "Sports", posts: "12,400" },
    { headline: "Fed Officials Signal Possible Rate Cut as Inflation Cools for Third Consecutive Month", category: "Finance", posts: "33,200" },
    { headline: "James Webb Telescope Captures Earliest Known Galaxy, Challenging Formation Models", category: "Science", posts: "21,700" },
    { headline: "Rockstar Drops First Gameplay Footage of GTA VI Online Mode", category: "Gaming", posts: "201,000" },
    { headline: "Euphoria Season 3 Cast Officially Confirmed, Filming Begins This Summer", category: "Entertainment", posts: "102,000" },
    { headline: "Bitcoin Surpasses $105K as Institutional Inflows Hit Monthly Record", category: "Crypto", posts: "89,300" },
    { headline: "Apple Teases Foldable iPhone Ahead of WWDC 2026 Keynote", category: "Technology", posts: "58,400" },
    { headline: "OpenAI Releases GPT-5 with Real-Time Multimodal Reasoning Capabilities", category: "Technology", posts: "134,000" },
    { headline: "SpaceX Starship Completes First Fully Successful Round-Trip Mars Mission Simulation", category: "Science", posts: "77,600" },
    { headline: "Taylor Swift Breaks Spotify Record with Third Week at Number One", category: "Entertainment", posts: "44,200" },
    { headline: "Ethereum ETF Sees $2.1B Inflows in Single Day as Institutions Pile In", category: "Crypto", posts: "31,800" },
    { headline: "NBA Finals: Celtics and Thunder Set for Epic Game 7 Showdown Tonight", category: "Sports", posts: "209,000" },
    { headline: "Tesla Full Self-Driving V13 Approved for Hands-Free Highways in 12 States", category: "Technology", posts: "67,300" },
    { headline: "Senate Passes Landmark AI Regulation Bill with Bipartisan Support", category: "Politics", posts: "88,100" },
    { headline: "McDonald's Brings Back Szechuan Sauce Permanently After Fan Campaign", category: "Food", posts: "14,500" },
    { headline: "Amazon Acquires Twitch Rival Kick for Reported $4.8 Billion", category: "Business", posts: "52,700" },
    { headline: "WHO Declares End to Three-Year Global Health Emergency", category: "Health", posts: "103,200" },
    { headline: "New Study Links Ultra-Processed Foods to 32% Higher Dementia Risk", category: "Health", posts: "29,400" },
    { headline: "Drake and Kendrick Lamar Announce Joint Tour After Squashing Beef", category: "Entertainment", posts: "178,900" },
    { headline: "Anthropic Raises $5B Series F at $100B Valuation Led by Google", category: "Technology", posts: "41,300" },
    { headline: "NVIDIA Unveils Blackwell Ultra GPU Delivering 10x Inference Speed Gains", category: "Technology", posts: "55,800" },
    { headline: "Global EV Sales Hit 50% Market Share for First Time in History", category: "Business", posts: "37,600" },
    { headline: "Climate Summit Reaches Historic Deal to Phase Out Coal by 2035", category: "World", posts: "94,500" },
    { headline: "Premier League Title Race Goes to Final Day as Arsenal and City Level on Points", category: "Sports", posts: "167,000" },
    { headline: "Fortnite Chapter 6 Season 3 Launches with Cyberpunk Crossover Event", category: "Gaming", posts: "88,400" },
    { headline: "US Dollar Hits 10-Year Low Against Yen as BOJ Raises Rates Again", category: "Finance", posts: "22,100" },
    { headline: "Meta Horizon OS Powers New Neural Interface Headset from Ray-Ban", category: "Technology", posts: "48,900" },
    { headline: "Kanye West Announces 'Vultures 3' with Surprise Drop Midnight Tonight", category: "Entertainment", posts: "231,000" },
    { headline: "Congress Approves $500B Infrastructure Bill Targeting Broadband Expansion", category: "Politics", posts: "19,700" },
    { headline: "Harvard Study: 8 Hours of Sleep Linked to 40% Lower Heart Disease Risk", category: "Health", posts: "61,200" },
    { headline: "Dogecoin Surges 80% After Elon Musk Mentions It in X Spaces Event", category: "Crypto", posts: "143,600" },
    { headline: "F1: Max Verstappen Claims Pole at Monaco Grand Prix in Record Time", category: "Sports", posts: "74,800" },
    { headline: "New York Times Wins Pulitzer for Investigative Series on Shadow Banking", category: "News", posts: "8,300" },
    { headline: "Disney Confirms Live-Action Mulan Reboot Directed by Chloe Zhao", category: "Entertainment", posts: "66,100" },
    { headline: "Riot Games Releases Valorant Mobile Globally After Beta Success", category: "Gaming", posts: "112,400" },
    { headline: "Japan Launches World's First Commercial Quantum Computing Cloud Service", category: "Technology", posts: "17,900" },
    { headline: "Adidas Yeezy Restocks Sell Out in Under 4 Minutes Across All Regions", category: "Fashion", posts: "39,500" },
    { headline: "EU Issues Record €4.2B Antitrust Fine Against Microsoft Over Teams Bundle", category: "Business", posts: "25,600" },
    { headline: "Archaeologists Discover 3,000-Year-Old Bronze Age City Beneath North Sea", category: "Science", posts: "33,800" },
    { headline: "Twitch Streamers Protest New Revenue Split Policy with 24-Hour Blackout", category: "Gaming", posts: "57,200" },
    { headline: "Beyoncé's 'Cowboy Carter' Tour Becomes Highest-Grossing of All Time", category: "Entertainment", posts: "189,300" },
    { headline: "China Unveils Hypersonic Passenger Jet Capable of London to NYC in 90 Minutes", category: "World", posts: "44,700" },
    { headline: "Pepe Coin Flips Shiba Inu to Become Third Largest Meme Coin by Market Cap", category: "Crypto", posts: "28,900" },
    { headline: "LeBron James Announces Retirement After Lakers Fall in Conference Finals", category: "Sports", posts: "312,000" },
    { headline: "GLP-1 Drugs Now Covered by Medicare After Landmark CMS Rule Change", category: "Health", posts: "46,100" },
    { headline: "Anthropic's Claude Beats GPT-5 on Every Major Coding Benchmark in Independent Test", category: "Technology", posts: "71,400" },
];

export function TrendingSidebar() {
    return (
        <aside className="hidden xl:flex flex-col flex-1 border-l border-zinc-800/50 sticky top-0 h-screen overflow-y-auto hidden-scrollbar">
            {NEWS.map((item, i) => (
                <NewsItem key={i} {...item} index={i} />
            ))}
        </aside>
    );
}

export function NewsItem({ headline, category, posts, index }: { headline: string; category: string; posts: string; index: number }) {
    return (
        <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: index * 0.03 }}
            className="w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors flex items-start gap-3 border-b border-zinc-800 group"
        >
            <div className="flex flex-col min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-zinc-100 leading-snug line-clamp-3">
                    {headline}
                </p>
                <span className="text-[12px] text-zinc-500 mt-1.5">
                    Trending now · {category} · {posts} posts
                </span>
            </div>
            <div className="w-16 h-16 rounded-xl bg-zinc-800 flex-shrink-0 mt-0.5" />
        </motion.button>
    );
}
