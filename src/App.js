import React, { useState, useRef, useEffect } from 'react';

const API_KEY = '7890b55bcd6d002ac87b6c4164bd7a84'; // <<< YOUR TMDB API KEY HERE

// LocalStorage Keys
const WATCHLIST_KEY = 'movieAppWatchlist';
const WATCH_HISTORY_KEY = 'movieAppWatchHistory';

// Debounce function (helper)
function debounce(func, delay) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

// Add this helper function in App.js (outside your component)
function extractAsteriskTitles(text) {
  // Match all **something** patterns, non-greedy
  const matches = [...text.matchAll(/\*\*(.+?)\*\*/g)];
  return matches.map(m => m[1]);
}

// Add this helper function in App.js (outside your component)
async function fetchTmdbDetailsForTitles(titles, type, apiKey) {
  const results = [];
  for (const title of titles) {
    const url = `https://api.themoviedb.org/3/search/${type}?api_key=${apiKey}&query=${encodeURIComponent(title)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      // Take the first result as the best match
      results.push({ ...data.results[0], media_type: type });
    }
  }
  return results;
}

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [view, setView] = useState('home');
  const [watchlist, setWatchlist] = useState([]);
  const [watchHistory, setWatchHistory] = useState({});

  const carouselRef = useRef(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = useRef(null);

  const [aiType, setAiType] = useState('movie'); // 'movie' or 'tv'
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState('');
  const [aiError, setAiError] = useState('');

  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

  // State for Detail Modal
  const [selectedItemDetails, setSelectedItemDetails] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);


  // --- Persistence Effect Hooks ---
  useEffect(() => {
    try {
      const storedWatchlist = localStorage.getItem(WATCHLIST_KEY);
      if (storedWatchlist) {
        try {
          const parsedWatchlist = JSON.parse(storedWatchlist);
          setWatchlist(Array.isArray(parsedWatchlist) ? parsedWatchlist : []);
        } catch (e) {
          console.error("Error parsing watchlist from localStorage", e);
          setWatchlist([]);
        }
      } else {
        setWatchlist([]);
      }

      const storedWatchHistory = localStorage.getItem(WATCH_HISTORY_KEY);
      if (storedWatchHistory) {
        try {
          const parsedHistory = JSON.parse(storedWatchHistory);
          setWatchHistory(parsedHistory || {});
        } catch (e) {
          console.error("Error parsing watch history from localStorage", e);
          setWatchHistory({});
        }
      } else {
        setWatchHistory({});
      }
    } catch (error) {
      console.error("Error loading data from localStorage:", error);
      setWatchlist([]);
      setWatchHistory({});
    } finally {
      setIsInitialLoadComplete(true);
    }
  }, []);

  useEffect(() => {
    if (!isInitialLoadComplete) return;
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
    } catch (error) {
      console.error("Error saving watchlist to localStorage:", error);
    }
  }, [watchlist, isInitialLoadComplete]);

  useEffect(() => {
    if (!isInitialLoadComplete) return;
    try {
      localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(watchHistory));
    } catch (error) {
      console.error("Error saving watch history to localStorage:", error);
    }
  }, [watchHistory, isInitialLoadComplete]);


  // --- Core App Logic ---
  const addToWatchlist = (item) => {
    setWatchlist(prevWatchlist => {
      if (!prevWatchlist.find(s => s.id === item.id && s.media_type === item.media_type)) {
        // If adding to watchlist, ensure it's not in 'watching' status in history
        const historyKey = `${item.media_type}-${item.id}`;
        setWatchHistory(prevHistory => {
            const newHistory = { ...prevHistory };
            if (newHistory[historyKey] && newHistory[historyKey].status === 'watching') {
                // Decide: remove from history, or just change status? For now, let's remove status.
                // Or, better, don't let it be added to watchlist if 'watching'.
                // This function is simple: just adds to watchlist. UI should control exclusivity.
            }
            return newHistory;
        });
        return [...prevWatchlist, item];
      }
      return prevWatchlist;
    });
  };

  

    const incrementRewatch = (item) => {
      const historyKey = `${item.media_type}-${item.id}`;
      setWatchHistory(prevHistory => {
        const newHistory = JSON.parse(JSON.stringify(prevHistory));
        if (!newHistory[historyKey]) {
          newHistory[historyKey] = {
            id: item.id,
            title: item.title,
            name: item.name,
            poster_path: item.poster_path,
            media_type: item.media_type,
            watched_entirely: true,
            status: 'rewatched',
            rewatchCount: 1,
            watchedAt: new Date().toISOString(),
            seasons: item.media_type === 'tv' ? {} : undefined,
          };
          if (item.media_type === 'tv' && selectedItemDetails && selectedItemDetails.seasonsData) {
            newHistory[historyKey].seasons = {};
            selectedItemDetails.seasonsData.forEach(s_detail => {
                if (s_detail.season_number > 0) {
                    const seasonNumStr = s_detail.season_number.toString();
                    newHistory[historyKey].seasons[seasonNumStr] = {
                        watched_entirely: true, watchedAt: new Date().toISOString(), episodes: {}
                    };
                    if (s_detail.episodes) {
                        s_detail.episodes.forEach(ep => {
                            newHistory[historyKey].seasons[seasonNumStr].episodes[ep.episode_number.toString()] = {
                                watched: true, watchedAt: new Date().toISOString()
                            };
                        });
                    }
                }
            });
          }
        } else {
          const entry = newHistory[historyKey];
          entry.status = 'rewatched';
          entry.watched_entirely = true;
          entry.rewatchCount = (entry.rewatchCount || 0) + 1;
          entry.watchedAt = new Date().toISOString();
          if (item.media_type === 'tv') {
            entry.status = 'watched'; // Or 'rewatched' if you want to track rewatch progress specifically
            entry.seasons = {};
            if (selectedItemDetails && selectedItemDetails.seasonsData) {
                selectedItemDetails.seasonsData.forEach(s_detail => {
                    if (s_detail.season_number > 0) {
                        const seasonNumStr = s_detail.season_number.toString();
                        entry.seasons[seasonNumStr] = {
                            watched_entirely: true, watchedAt: new Date().toISOString(), episodes: {}
                        };
                        if (s_detail.episodes) {
                            s_detail.episodes.forEach(ep => {
                                entry.seasons[seasonNumStr].episodes[ep.episode_number.toString()] = {
                                    watched: true, watchedAt: new Date().toISOString()
                                };
                            });
                        }
                    }
                });
            }
          }
        }
        return newHistory;
      });
      setWatchlist(prevWatchlist => prevWatchlist.filter(s => !(s.id === item.id && s.media_type === item.media_type)));
    };

  const markAsWatched = (item, seasonNumber = null, episodeNumber = null, isWatched = true) => {
    const historyKey = `${item.media_type}-${item.id}`;

    setWatchHistory(prevHistory => {
      const newHistory = JSON.parse(JSON.stringify(prevHistory));

      const updateSeriesWatchedStatus = (seriesEntryToUpdate, seriesDetailsSource) => {
        if (!seriesDetailsSource || (!seriesDetailsSource.seasonsData && !seriesDetailsSource.seasons)) return;
        const seasonsList = seriesDetailsSource.seasonsData || seriesDetailsSource.seasons;
        const seasonsToConsiderForCompletion = seasonsList.filter(s_detail => s_detail.season_number > 0);
        if (seasonsToConsiderForCompletion.length > 0) {
            const allSeasonsAreMarkedWatched = seasonsToConsiderForCompletion.every(s_detail =>
                !!seriesEntryToUpdate.seasons?.[s_detail.season_number.toString()]?.watched_entirely
            );
            seriesEntryToUpdate.watched_entirely = allSeasonsAreMarkedWatched;
            if (allSeasonsAreMarkedWatched) {
                seriesEntryToUpdate.watchedAt = new Date().toISOString();
                if (seriesEntryToUpdate.status !== 'rewatched') {
                    seriesEntryToUpdate.status = 'watched';
                }
            } else {
                delete seriesEntryToUpdate.watchedAt;
                if (seriesEntryToUpdate.status === 'watched' || seriesEntryToUpdate.status === 'rewatched') {
                    seriesEntryToUpdate.status = 'watching';
                }
            }
        } else {
            seriesEntryToUpdate.watched_entirely = false;
            delete seriesEntryToUpdate.watchedAt;
            if (seriesEntryToUpdate.status === 'watched' || seriesEntryToUpdate.status === 'rewatched') {
                 seriesEntryToUpdate.status = 'watching';
            }
        }
      };

      if (!newHistory[historyKey]) {
        newHistory[historyKey] = {
          id: item.id,
          title: item.title,
          name: item.name,
          poster_path: item.poster_path,
          media_type: item.media_type,
          watched_entirely: false,
          status: 'watching',
          rewatchCount: 0,
          watchedAt: new Date().toISOString(),
          seasons: item.media_type === 'tv' ? {} : undefined,
        };
      }
      const currentEntry = newHistory[historyKey];

      if (item.media_type === 'movie') {
        if (isWatched) {
          currentEntry.watched_entirely = true;
          currentEntry.status = currentEntry.rewatchCount > 0 ? 'rewatched' : 'watched';
          currentEntry.watchedAt = new Date().toISOString();
        } else {
          delete newHistory[historyKey];
        }
      } else if (item.media_type === 'tv') {
        if (!isWatched && seasonNumber === null && episodeNumber === null) {
            delete newHistory[historyKey];
            return newHistory;
        }
        if (!isWatched && (currentEntry.status === 'watched' || currentEntry.status === 'rewatched')) {
            currentEntry.status = 'watching';
            currentEntry.watched_entirely = false;
            delete currentEntry.watchedAt;
        }

        if (seasonNumber !== null && episodeNumber !== null) {
          const seasonNumStr = seasonNumber.toString();
          const episodeNumStr = episodeNumber.toString();
          if (!currentEntry.seasons[seasonNumStr]) currentEntry.seasons[seasonNumStr] = { watched_entirely: false, episodes: {} };
          if (!currentEntry.seasons[seasonNumStr].episodes) currentEntry.seasons[seasonNumStr].episodes = {};
          if (isWatched) {
            currentEntry.seasons[seasonNumStr].episodes[episodeNumStr] = { watched: true, watchedAt: new Date().toISOString() };
          } else {
            delete currentEntry.seasons[seasonNumStr].episodes[episodeNumStr];
            currentEntry.seasons[seasonNumStr].watched_entirely = false;
            delete currentEntry.seasons[seasonNumStr].watchedAt;
            currentEntry.watched_entirely = false;
            delete currentEntry.watchedAt;
          }
          if (selectedItemDetails && selectedItemDetails.seasonsData && currentEntry.seasons[seasonNumStr]) {
            const currentSeasonApiData = selectedItemDetails.seasonsData.find(s => s.season_number === seasonNumber);
            if (currentSeasonApiData && currentSeasonApiData.episodes && currentSeasonApiData.episode_count > 0) {
                const allEpisodesInSeasonWatched = currentSeasonApiData.episodes.every(
                    ep => !!currentEntry.seasons[seasonNumStr]?.episodes?.[ep.episode_number.toString()]?.watched
                );
                currentEntry.seasons[seasonNumStr].watched_entirely = allEpisodesInSeasonWatched;
                if (allEpisodesInSeasonWatched) currentEntry.seasons[seasonNumStr].watchedAt = new Date().toISOString();
                else delete currentEntry.seasons[seasonNumStr].watchedAt;
            }
          }
        }
        else if (seasonNumber !== null && episodeNumber === null) {
            const seasonNumStr = seasonNumber.toString();
            if (!currentEntry.seasons[seasonNumStr]) currentEntry.seasons[seasonNumStr] = { watched_entirely: false, episodes: {} };
            currentEntry.seasons[seasonNumStr].watched_entirely = isWatched;
            if (isWatched) currentEntry.seasons[seasonNumStr].watchedAt = new Date().toISOString();
            else delete currentEntry.seasons[seasonNumStr].watchedAt;
            if (selectedItemDetails && selectedItemDetails.seasonsData) {
                const currentSeasonApiData = selectedItemDetails.seasonsData.find(s => s.season_number === seasonNumber);
                if (!currentEntry.seasons[seasonNumStr].episodes) currentEntry.seasons[seasonNumStr].episodes = {};
                if (currentSeasonApiData && currentSeasonApiData.episodes && currentSeasonApiData.episode_count > 0) {
                    currentSeasonApiData.episodes.forEach(ep => {
                        if (isWatched) currentEntry.seasons[seasonNumStr].episodes[ep.episode_number.toString()] = { watched: true, watchedAt: new Date().toISOString() };
                    });
                }
                if (!isWatched) currentEntry.seasons[seasonNumStr].episodes = {};
            }
        }
        else {
          currentEntry.watched_entirely = isWatched;
          currentEntry.status = isWatched ? (currentEntry.rewatchCount > 0 ? 'rewatched' : 'watched') : 'watching';
          if (isWatched) currentEntry.watchedAt = new Date().toISOString();
          else delete currentEntry.watchedAt;
          if (selectedItemDetails && selectedItemDetails.seasonsData) {
            selectedItemDetails.seasonsData.forEach(s_detail => {
              if (s_detail.season_number > 0) {
                const seasonNumStr = s_detail.season_number.toString();
                if (isWatched && !currentEntry.seasons[seasonNumStr]) currentEntry.seasons[seasonNumStr] = { episodes: {} };
                if (currentEntry.seasons[seasonNumStr]) {
                  currentEntry.seasons[seasonNumStr].watched_entirely = isWatched;
                  if (isWatched) currentEntry.seasons[seasonNumStr].watchedAt = new Date().toISOString();
                  else delete currentEntry.seasons[seasonNumStr].watchedAt;
                  if (!currentEntry.seasons[seasonNumStr].episodes) currentEntry.seasons[seasonNumStr].episodes = {};
                  if (s_detail.episode_count > 0 && s_detail.episodes) {
                    s_detail.episodes.forEach(ep => {
                      if (isWatched) currentEntry.seasons[seasonNumStr].episodes[ep.episode_number.toString()] = { watched: true, watchedAt: new Date().toISOString() };
                    });
                  }
                  if (!isWatched) currentEntry.seasons[seasonNumStr].episodes = {};
                }
              }
            });
          }
        }
        if (currentEntry) {
            updateSeriesWatchedStatus(currentEntry, selectedItemDetails);
        }
      }
      return newHistory;
    });

    if (isWatched &&
        (
            item.media_type === 'movie' ||
            (item.media_type === 'tv' && seasonNumber === null && episodeNumber === null && (watchHistory[historyKey]?.status !== 'watching'))
        )
       ) {
        setWatchlist(prevWatchlist => prevWatchlist.filter(s => !(s.id === item.id && s.media_type === item.media_type)));
    }
  };

  const searchAll = async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const types = ['tv', 'movie'];
    let combinedResults = [];
    for (const type of types) {
      const url = `https://api.themoviedb.org/3/search/${type}?api_key=${API_KEY}&query=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.results) {
        combinedResults = combinedResults.concat(
          data.results.map(item => ({ ...item, media_type: type }))
        );
      }
    }
    setResults(combinedResults);
  };

  const fetchSuggestions = async (currentQuery) => {
    if (!currentQuery.trim()) {
      setSuggestions([]); setShowSuggestions(false); return;
    }
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(currentQuery)}&page=1&include_adult=false`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.results) {
        const filteredSuggestions = data.results
          .filter(item => (item.media_type === 'movie' || item.media_type === 'tv') && (item.title || item.name))
          .slice(0, 7);
        setSuggestions(filteredSuggestions);
        setShowSuggestions(filteredSuggestions.length > 0);
      } else {
        setSuggestions([]); setShowSuggestions(false);
      }
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      setSuggestions([]); setShowSuggestions(false);
    }
  };

  const debouncedFetchSuggestions = useRef(debounce(fetchSuggestions, 300)).current;

  const handleInputChange = (e) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    if (newQuery.trim() === '') {
      setSuggestions([]); setShowSuggestions(false); setResults([]);
    } else {
      debouncedFetchSuggestions(newQuery);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    const title = suggestion.media_type === 'movie' ? suggestion.title : suggestion.name;
    setQuery(title);
    setShowSuggestions(false); setSuggestions([]);
    if (searchContainerRef.current) {
        const inputElement = searchContainerRef.current.querySelector('input');
        if (inputElement) inputElement.focus();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      setShowSuggestions(false); searchAll();
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const scrollCarousel = (direction) => {
    if (!carouselRef.current) return;
    const scrollAmount = carouselRef.current.offsetWidth * 0.75;
    carouselRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  };


  

  

  const fetchItemDetails = async (itemFromCard) => {
    if (!itemFromCard || !itemFromCard.id || !itemFromCard.media_type) return;
    setIsLoadingDetails(true);
    setSelectedItemDetails(null);
    setIsDetailModalOpen(true);
    try {
      let detailsUrl = `https://api.themoviedb.org/3/${itemFromCard.media_type}/${itemFromCard.id}?api_key=${API_KEY}&language=en-US`;
      if (itemFromCard.media_type === 'tv') {
        detailsUrl += '&append_to_response=aggregate_credits,content_ratings';
      } else if (itemFromCard.media_type === 'movie') {
        detailsUrl += '&append_to_response=release_dates';
      }
      const res = await fetch(detailsUrl);
      if (!res.ok) throw new Error(`Failed to fetch details: ${res.status}`);
      const detailedData = await res.json();
      let fullDetails = { ...itemFromCard, ...detailedData };
      if (fullDetails.media_type === 'tv' && detailedData.seasons) {
        fullDetails.seasonsData = [];
        const sortedSeasons = [...detailedData.seasons].sort((a,b) => a.season_number - b.season_number);
        for (const season of sortedSeasons) {
          const seasonDetailUrl = `https://api.themoviedb.org/3/tv/${fullDetails.id}/season/${season.season_number}?api_key=${API_KEY}&language=en-US`;
          const seasonRes = await fetch(seasonDetailUrl);
          if (seasonRes.ok) {
            const seasonData = await seasonRes.json();
            fullDetails.seasonsData.push(seasonData);
          } else {
            fullDetails.seasonsData.push({ ...season, episodes: [] });
          }
        }
      }
      setSelectedItemDetails(fullDetails);
    } catch (error) {
      console.error("Error fetching item details:", error);
      setSelectedItemDetails({ ...itemFromCard, error: `Failed to load details: ${error.message}`});
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const getWatchedEpisodeCountForSeason = (seriesId, seasonNumber) => {
    const seriesHistoryKey = `tv-${seriesId}`;
    const seriesEntry = watchHistory[seriesHistoryKey];
    if (seriesEntry && seriesEntry.seasons && seriesEntry.seasons[seasonNumber.toString()] && seriesEntry.seasons[seasonNumber.toString()].episodes) {
      return Object.values(seriesEntry.seasons[seasonNumber.toString()].episodes).filter(ep => ep.watched).length;
    }
    return 0;
  };

  const renderItem = (item, context = 'default') => {
    const title = item.media_type === 'movie' ? (item.title || 'Unknown Title') : (item.name || 'Unknown Series');
    const posterPath = item.poster_path;
    const releaseYear = item.media_type === 'movie'
        ? (item.release_date ? item.release_date.substring(0,4) : 'N/A')
        : (item.first_air_date ? item.first_air_date.substring(0,4) : 'N/A');

    const inWatchlist = watchlist.find(s => s.id === item.id && s.media_type === item.media_type);
    const historyKey = `${item.media_type}-${item.id}`;
    const historyEntry = watchHistory[historyKey];

    const currentStatus = historyEntry?.status;
    const isCompletelyWatched = !!(historyEntry && historyEntry.watched_entirely);
    const rewatchCount = historyEntry?.rewatchCount || 0;

    const cardWidth = context === 'carousel' ? '160px' : '180px';
    const imageHeight = context === 'carousel' ? '240px' : '270px';

    const handleLocalAddToWatchlist = (e, currentItem) => {
      e.stopPropagation();
      addToWatchlist(currentItem);
    };

    const handleLocalMarkAsWatchingClick = (e, currentItem) => {
        e.stopPropagation();
    };

    const handleLocalIncrementRewatchClick = (e, currentItem) => {
        e.stopPropagation();
        incrementRewatch(currentItem);
    };

    const handleLocalMarkOrUnmarkWatchedClick = (e, currentItem) => {
        e.stopPropagation();
        markAsWatched(currentItem, null, null);
    };

    return (
      <div
        key={`${item.media_type}-${item.id}-${context}`}
        className="item-card"
        style={{ width: cardWidth, cursor: 'pointer' }}
        onClick={() => fetchItemDetails(item)}
        title={`Click for details on ${title}`}
      >
        {posterPath ? (
          <img src={`https://image.tmdb.org/t/p/w300${posterPath}`} alt={title} className="item-poster" style={{ height: imageHeight }}/>
        ) : (
          <div className="item-poster-placeholder" style={{ height: imageHeight }}><span>No Image</span></div>
        )}
        <div className="item-info">
          <h3 className="item-title" title={title}>{title}</h3>
          <p className="item-meta">{item.media_type.toUpperCase()} • {releaseYear}</p>
          <div className="item-actions">
            {!historyEntry && !inWatchlist && (
              <button onClick={(e) => handleLocalAddToWatchlist(e, item)} className="item-action-btn watchlist-btn">
                <span role="img" aria-label="Add to watchlist">➕</span> Watchlist
              </button>
            )}
            {((!historyEntry || (historyEntry && currentStatus !== 'watching' && !isCompletelyWatched))) && !inWatchlist && (
              <button onClick={(e) => handleLocalMarkAsWatchingClick(e, item)} className="item-action-btn watching-btn">
                <span role="img" aria-label="Mark as currently watching">▶️</span> Watching
              </button>
            )}
            {currentStatus !== 'watching' && (
                 <button
                    onClick={(e) => handleLocalMarkOrUnmarkWatchedClick(e, item)}
                    className={`item-action-btn ${isCompletelyWatched ? 'unwatch-btn' : 'watched-btn'}`}
                 >
                    <span role="img" aria-label={isCompletelyWatched ? "Unmark as watched" : "Mark as watched"}>
                        {isCompletelyWatched ? '✖️' : '✔️'}
                    </span>
                    {isCompletelyWatched ? "Unwatch" : "Watched"}
                 </button>
            )}
            {isCompletelyWatched && (
              <button onClick={(e) => handleLocalIncrementRewatchClick(e, item)} className="item-action-btn rewatch-btn">
                <span role="img" aria-label="Mark as rewatched">🔁</span> Rewatch
                 {rewatchCount > 0 && ` (${rewatchCount})`}
              </button>
            )}
          </div>
          <div className="item-status-indicators">
            {inWatchlist && <div className="item-status-indicator watchlist-indicator">On Watchlist</div>}
            {isCompletelyWatched && currentStatus === 'watched' && <div className="item-status-indicator watched-indicator">✔️ Watched</div>}
            {isCompletelyWatched && currentStatus === 'rewatched' && <div className="item-status-indicator rewatched-indicator">🔁 Rewatched {rewatchCount > 0 ? `${rewatchCount}x` : ''}</div>}
            {item.media_type === 'tv' && historyEntry && !isCompletelyWatched && currentStatus !== 'watching' && (
                 <div className="item-status-indicator partially-watched-indicator">Partially Watched</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const getContentToShow = () => {
    if (query.trim() && results.length > 0) {
      return (
        <section>
          <h2 className="section-title">Search Results for "{query}"</h2>
          <div className="items-grid">{results.map(item => renderItem(item))}</div>
        </section>
      );
    }
    if (view === 'home') {
      return (
        <>
          {/* AI Recommendations Section */}
          <section className="ai-recommend-section" style={{marginBottom: '30px', background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)'}}>
            <h2 style={{marginTop: 0}}>AI Recommendations</h2>
            <div style={{marginBottom: '10px'}}>
              <label>
                <input
                  type="radio"
                  checked={aiType === 'movie'}
                  onChange={() => setAiType('movie')}
                /> Movies
              </label>
              <label style={{marginLeft: '20px'}}>
                <input
                  type="radio"
                  checked={aiType === 'tv'}
                  onChange={() => setAiType('tv')}
                /> TV Shows
              </label>
              <button
                onClick={fetchAiRecommendation}
                style={{marginLeft: '30px', padding: '8px 18px', borderRadius: '6px', background: '#007bff', color: 'white', border: 'none', cursor: 'pointer'}}
                disabled={aiLoading}
              >
                {aiLoading ? 'Loading...' : 'Get Recommendation'}
              </button>
            </div>
            {aiError && <div style={{color: 'red'}}>{aiError}</div>}
            {aiRecommendation && (
              <div style={{whiteSpace: 'pre-wrap', marginTop: '15px', background: '#f8f9fa', padding: '15px', borderRadius: '6px'}}>
                {aiRecommendation}
              </div>
            )}
          </section>
          {watchlist.length > 0 && (
            <section>
              <h2 className="section-title">From Your Watchlist</h2>
              <div className="carousel-container">
                <button onClick={() => scrollCarousel('left')} className="carousel-nav-btn prev" aria-label="Scroll left">❮</button>
                <div ref={carouselRef} className="carousel-track hide-scrollbar">
                  {watchlist.map(item => renderItem(item, 'carousel'))}
                </div>
                <button onClick={() => scrollCarousel('right')} className="carousel-nav-btn next" aria-label="Scroll right">❯</button>
              </div>
            </section>
          )}
           {Object.keys(watchHistory).length > 0 && view === 'home' && (
            <section style={{marginTop: '30px'}}>
                <h2 className="section-title">Recently Interacted With</h2>
                <div className="items-grid">
                    {Object.values(watchHistory)
                        .filter(entry => entry.watchedAt || Object.values(entry.seasons || {}).some(s => s.watchedAt || Object.values(s.episodes || {}).some(ep => ep.watchedAt)))
                        .sort((a, b) => {
                            const getLatestTime = (entry) => {
                                let latest = new Date(entry.watchedAt || 0).getTime();
                                if(entry.seasons) {
                                    Object.values(entry.seasons).forEach(s => {
                                        latest = Math.max(latest, new Date(s.watchedAt || 0).getTime());
                                        if(s.episodes) {
                                            Object.values(s.episodes).forEach(ep => {
                                                latest = Math.max(latest, new Date(ep.watchedAt || 0).getTime());
                                            });
                                        }
                                    });
                                }
                                return latest;
                            };
                            return getLatestTime(b) - getLatestTime(a);
                        })
                        .slice(0, (results.length > 0 ? 2 : 4) )
                        .map(historyEntry => {
                            const displayItem = {
                                id: historyEntry.id,
                                media_type: historyEntry.media_type,
                                title: historyEntry.title,
                                name: historyEntry.name,
                                poster_path: historyEntry.poster_path,
                            };
                            return renderItem(displayItem);
                        })
                    }
                </div>
            </section>
            )}
            
        </>
      );
    } else if (view === 'watchlist') {
      return (
        <section>
          <h2 className="section-title">Your Watchlist ({watchlist.length})</h2>
          {watchlist.length === 0 ? (
            <p className="empty-state-message">Your watchlist is empty. Add some movies or TV shows!</p>
          ) : (
            <div className="items-grid">{watchlist.map(item => renderItem(item))}</div>
          )}
        </section>
      );
    } else if (view === 'history') {
        const historyItemsToDisplay = Object.values(watchHistory)
             .filter(entry => entry.watchedAt || Object.values(entry.seasons || {}).some(s => s.watchedAt || Object.values(s.episodes || {}).some(ep => ep.watchedAt)))
            .sort((a, b) => {
                const getLatestTime = (entry) => {
                    let latest = new Date(entry.watchedAt || 0).getTime();
                    if(entry.seasons) {
                        Object.values(entry.seasons).forEach(s => {
                            latest = Math.max(latest, new Date(s.watchedAt || 0).getTime());
                            if(s.episodes) {
                                Object.values(s.episodes).forEach(ep => {
                                    latest = Math.max(latest, new Date(ep.watchedAt || 0).getTime());
                                });
                            }
                        });
                    }
                    return latest;
                };
                return getLatestTime(b) - getLatestTime(a);
            })
            .map(entry => ({
                id: entry.id,
                media_type: entry.media_type,
                title: entry.title,
                name: entry.name,
                poster_path: entry.poster_path,
                release_date: entry.release_date,
                first_air_date: entry.first_air_date
            }));
      return (
        <section>
          <h2 className="section-title">Watch History ({historyItemsToDisplay.length})</h2>
          {historyItemsToDisplay.length === 0 ? (
            <p className="empty-state-message">You haven't marked anything as watched yet.</p>
          ) : (
            <div className="items-grid">{historyItemsToDisplay.map(item => renderItem(item))}</div>
          )}
        </section>
      );
    }
    return null;
  };

  const renderDetailModal = () => {
    if (!isDetailModalOpen) return null;
    if (isLoadingDetails && !selectedItemDetails) {
      return (
        <div className="detail-modal-backdrop" onClick={() => setIsDetailModalOpen(false)}>
          <div className="detail-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="detail-modal-close" onClick={() => setIsDetailModalOpen(false)}>×</button>
            <div className="spinner-modal"><div className="spinner"></div> Loading details...</div>
          </div>
        </div>
      );
    }
    const item = selectedItemDetails;
    if (!item) return null;
    if (item.error) {
        return (
             <div className="detail-modal-backdrop" onClick={() => setIsDetailModalOpen(false)}>
                <div className="detail-modal-content modal-error-content" onClick={(e) => e.stopPropagation()}>
                    <button className="detail-modal-close" onClick={() => setIsDetailModalOpen(false)}>×</button>
                    <p style={{color: 'var(--danger-color)', textAlign: 'center', fontWeight: 'bold'}}>{item.error}</p>
                </div>
            </div>
        )
    }

    const historyKey = `${item.media_type}-${item.id}`;
    const currentHistoryEntry = watchHistory[historyKey] || { seasons: {}, watched_entirely: false, status: null, rewatchCount: 0 };
    const title = item.media_type === 'movie' ? item.title : item.name;
    const overview = item.overview;
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    const releaseDate = item.media_type === 'movie' ? item.release_date : item.first_air_date;
    const posterPath = item.poster_path
      ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
      : 'https://via.placeholder.com/342x513.png?text=No+Image';

    const toggleWholeSeriesWatched = () => {
        markAsWatched(item, null, null, !currentHistoryEntry.watched_entirely);
    };
    const toggleSeasonWatched = (seasonNum) => {
        markAsWatched(item, seasonNum, null);
    };
    const toggleEpisodeWatched = (seasonNum, episodeNum) => {
        markAsWatched(item, seasonNum, episodeNum);
    };

    return (
      <div className="detail-modal-backdrop" onClick={() => setIsDetailModalOpen(false)}>
        <div className="detail-modal-content" onClick={(e) => e.stopPropagation()}>
          <button className="detail-modal-close" onClick={() => setIsDetailModalOpen(false)}>×</button>
          <>
            <div className="detail-modal-header">
              <img src={posterPath} alt={title} className="detail-modal-poster" />
              <div className="detail-modal-title-section">
                <h1>{title}</h1>
                {item.tagline && <p><em>{item.tagline}</em></p>}
                <p><strong>Released:</strong> {releaseDate ? new Date(releaseDate).toLocaleDateString() : 'N/A'}</p>
                <p><strong>Rating:</strong> {rating} / 10 ({item.vote_count} votes)</p>
                <p><strong>Genres:</strong> {item.genres?.map(g => g.name).join(', ') || 'N/A'}</p>
                {item.media_type === 'tv' && <p><strong>Seasons:</strong> {item.number_of_seasons}</p>}
                {item.media_type === 'tv' && <p><strong>Episodes:</strong> {item.number_of_episodes}</p>}
                {item.runtime && <p><strong>Runtime:</strong> {item.runtime} min</p>}
                {item.media_type === 'tv' && item.episode_run_time && item.episode_run_time.length > 0 && (
                    <p><strong>Episode Runtime:</strong> {item.episode_run_time.join(' / ')} min</p>
                )}
                {currentHistoryEntry.status === 'watched' && <p className="status-text">Status: Watched</p>}
                {currentHistoryEntry.status === 'rewatched' && <p className="status-text">Status: Rewatched {currentHistoryEntry.rewatchCount}x</p>}

                <label className="watched-checkbox-label">
                    <input
                        type="checkbox"
                        checked={currentHistoryEntry.watched_entirely || false}
                        onChange={toggleWholeSeriesWatched}
                        disabled={currentHistoryEntry.status === 'watching' && item.media_type === 'movie'} // Disable for movie if "watching"
                    />
                    Mark {item.media_type === 'tv' ? "Entire Series" : "as"} Watched
                </label>
                {currentHistoryEntry.watched_entirely && (
                    <button onClick={() => incrementRewatch(item)} className="detail-action-btn">
                        {currentHistoryEntry.rewatchCount > 0 ? `Rewatch Again (${currentHistoryEntry.rewatchCount + 1})` : "Start Rewatch"}
                    </button>
                )}
              </div>
            </div>
            <div className="detail-modal-body">
              <h2>Overview</h2>
              <p>{overview || 'No overview available.'}</p>
              {item.media_type === 'tv' && item.seasonsData && item.seasonsData.length > 0 && (
                <div className="seasons-section">
                  <h2>Seasons & Episodes</h2>
                  {item.seasonsData
                    .filter(season => !(season.season_number === 0 && season.episode_count < 1) )
                    .sort((a, b) => a.season_number - b.season_number)
                    .map(season => {
                        const seasonNumStr = season.season_number.toString();
                        const seasonHistory = currentHistoryEntry.seasons?.[seasonNumStr] || { episodes: {}, watched_entirely: false };
                        const watchedEpisodeCount = getWatchedEpisodeCountForSeason(item.id, season.season_number);
                        return (
                            <details key={season.id || season.season_number} className="season-details" open={season.season_number === 1 || season.season_number === 0}>
                            <summary>
                                <label className="watched-checkbox-label season-level-checkbox" onClick={(e) => e.preventDefault()}>
                                <input
                                    type="checkbox"
                                    checked={seasonHistory.watched_entirely || false}
                                    onChange={() => toggleSeasonWatched(season.season_number)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                </label>
                                <strong>{season.name || `Season ${season.season_number}`}</strong>
                                ({watchedEpisodeCount}/{season.episode_count} episodes watched)
                                {season.air_date && ` - Aired: ${new Date(season.air_date).toLocaleDateString()}`}
                            </summary>
                            {season.overview && <p className="season-overview">{season.overview}</p>}
                            {isLoadingDetails && !season.episodes ? <div className="spinner-modal"><div className="spinner"></div></div> :
                            (season.episodes && season.episodes.length > 0 ? (
                                <ul className="episode-list">
                                {season.episodes.sort((a,b) => a.episode_number - b.episode_number).map(episode => {
                                    const episodeNumStr = episode.episode_number.toString();
                                    const episodeHistory = seasonHistory.episodes?.[episodeNumStr] || { watched: false };
                                    return (
                                    <li key={episode.id}>
                                        <label className="watched-checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={episodeHistory.watched || false}
                                            onChange={() => toggleEpisodeWatched(season.season_number, episode.episode_number)}
                                        />
                                        </label>
                                        <div>
                                            <strong>E{episode.episode_number}: {episode.name}</strong>
                                            {episode.air_date && ` (Aired: ${new Date(episode.air_date).toLocaleDateString()})`}
                                            {episode.vote_average > 0 && ` (Rating: ${episode.vote_average.toFixed(1)})`}
                                            {episode.overview && <p>{episode.overview}</p>}
                                        </div>
                                    </li>
                                    );
                                })}
                                </ul>
                            ) : <p style={{paddingLeft: '15px', fontStyle: 'italic'}}>No episode information available for this season.</p>)}
                            </details>
                        );
                    })}
                </div>
              )}
            </div>
          </>
        </div>
      </div>
    );
  };

  const fetchAiRecommendation = async () => {
    setAiLoading(true);
    setAiError('');
    setAiRecommendation('');
    try {
      // Prepare watch history as an array of episodes/items
      const historyArr = Object.values(watchHistory);
      const res = await fetch('http://127.0.0.1:5000/api/ai-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: historyArr, type: aiType })
      });
      if (!res.ok) throw new Error('Failed to fetch recommendation');
      const data = await res.json();
      setAiRecommendation(data.recommendation);
    } catch (err) {
      setAiError('Could not get recommendation. Try again later.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <>
      <style>{`
        :root { --primary-color: #007bff; --primary-hover-color: #0056b3; --secondary-color: #6c757d; --light-gray: #f8f9fa; --medium-gray: #e9ecef; --dark-gray: #343a40; --text-color: #212529; --text-muted: #6c757d; --success-color: #28a745; --warning-color: #ffc107; --danger-color: #dc3545; --rewatch-color: #6f42c1; --card-shadow: 0 4px 8px rgba(0,0,0,0.1); --border-radius: 8px; }
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif; background-color: var(--light-gray); color: var(--text-color); line-height: 1.6; }
        * { box-sizing: border-box; }
        .app-container { max-width: 1200px; margin: 0 auto; padding: 25px; }
        .app-header { color: var(--primary-color); text-align: center; margin-bottom: 30px; font-size: 2.5em; font-weight: 300; }
        .navigation-tabs { display: flex; gap: 10px; margin-bottom: 25px; padding-bottom: 15px; border-bottom: 1px solid var(--medium-gray); }
        .nav-tab-btn { padding: 10px 18px; border: 1px solid transparent; border-radius: var(--border-radius); background-color: var(--medium-gray); color: var(--text-muted); cursor: pointer; font-weight: 500; text-transform: capitalize; transition: all 0.2s ease; }
        .nav-tab-btn:hover { background-color: #d3d9df; }
        .nav-tab-btn.active { background-color: var(--primary-color); color: white; border-color: var(--primary-color); }
        .search-area { margin-bottom: 30px; position: relative; display: flex; align-items: center; gap: 10px; }
        .search-input { flex-grow: 1; padding: 12px 15px; font-size: 1rem; border: 1px solid #ced4da; border-radius: var(--border-radius); transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        .search-input:focus { border-color: var(--primary-color); box-shadow: 0 0 0 0.2rem rgba(0,123,255,.25); outline: none; }
        .search-btn { padding: 12px 20px; background-color: var(--primary-color); color: white; border: none; border-radius: var(--border-radius); font-size: 1rem; font-weight: 500; cursor: pointer; transition: background-color 0.2s ease; }
        .search-btn:hover { background-color: var(--primary-hover-color); }
        .suggestions-list { list-style-type: none; padding: 0; margin: 5px 0 0 0; border: 1px solid #ced4da; border-radius: var(--border-radius); position: absolute; top: 100%; left: 0; background-color: white; z-index: 1000; max-height: 350px; overflow-y: auto; box-shadow: var(--card-shadow); }
        .suggestion-item { padding: 10px 15px; cursor: pointer; border-bottom: 1px solid var(--medium-gray); font-size: 0.95em; display: flex; align-items: center; gap: 12px; transition: background-color 0.15s ease; }
        .suggestion-item:last-child { border-bottom: none; }
        .suggestion-item:hover { background-color: var(--light-gray); }
        .suggestion-poster { width: 40px; height: 60px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
        .suggestion-no-poster { width: 40px; height: 60px; background-color: var(--medium-gray); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.7em; color: var(--text-muted); flex-shrink: 0; }
        .suggestion-details { display: flex; flex-direction: column; overflow: hidden; }
        .suggestion-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-color); }
        .suggestion-meta { font-size: 0.85em; color: var(--text-muted); }
        .section-title { font-size: 1.8em; font-weight: 300; color: var(--dark-gray); margin-top: 30px; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid var(--medium-gray); }
        .items-grid { display: flex; flex-wrap: wrap; gap: 20px; justify-content: flex-start; }
        .item-card { background-color: white; border-radius: var(--border-radius); box-shadow: var(--card-shadow); overflow: hidden; display: flex; flex-direction: column; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .item-card:hover { transform: translateY(-5px); box-shadow: 0 8px 16px rgba(0,0,0,0.15); }
        .item-poster { width: 100%; object-fit: cover; display: block; }
        .item-poster-placeholder { width: 100%; background-color: var(--medium-gray); display: flex; justify-content: center; align-items: center; color: var(--text-muted); font-size: 0.9em; }
        .item-info { padding: 12px; display: flex; flex-direction: column; flex-grow: 1; }
        .item-title { font-size: 1em; font-weight: 600; margin: 0 0 4px 0; color: var(--text-color); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; min-height: 2.4em; }
        .item-meta { font-size: 0.8em; color: var(--text-muted); margin: 0 0 10px 0; }
        .item-actions { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
        .item-action-btn { padding: 8px 10px; border: 1px solid var(--medium-gray); border-radius: 6px; background-color: transparent; cursor: pointer; font-size: 0.85em; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s ease; }
        .item-action-btn span[role="img"] { font-size: 1.1em; }
        .item-action-btn.watchlist-btn { color: var(--warning-color); border-color: var(--warning-color); }
        .item-action-btn.watchlist-btn:hover { background-color: var(--warning-color); color: white; }
        .item-action-btn.watched-btn { color: var(--success-color); border-color: var(--success-color); }
        .item-action-btn.watched-btn:hover { background-color: var(--success-color); color: white; }
        .item-action-btn.unwatch-btn { color: var(--secondary-color); border-color: var(--secondary-color); }
        .item-action-btn.unwatch-btn:hover { background-color: var(--secondary-color); color: white; }
        .item-action-btn.watching-btn { color: var(--primary-color); border-color: var(--primary-color); }
        .item-action-btn.watching-btn:hover { background-color: var(--primary-color); color: white; }
        .item-action-btn.rewatch-btn { color: var(--rewatch-color); border-color: var(--rewatch-color); }
        .item-action-btn.rewatch-btn:hover { background-color: var(--rewatch-color); color: white; }
        .item-status-indicators { margin-top: 10px; display: flex; flex-direction: column; gap: 5px; }
        .item-status-indicator { font-size: 0.9em; font-weight: 500; padding: 4px 0; text-align: center; border-radius: 4px; }
        .item-status-indicator.watchlist-indicator { color: var(--warning-color); background-color: #fff3cd; border: 1px solid var(--warning-color); }
        .item-status-indicator.watched-indicator { color: var(--success-color); background-color: #d4edda; border: 1px solid var(--success-color); }
        .item-status-indicator.watching-indicator { color: var(--primary-color); background-color: #cce5ff; border: 1px solid var(--primary-color); }
        .item-status-indicator.rewatched-indicator { color: var(--rewatch-color); background-color: #e2d9f3; border: 1px solid var(--rewatch-color); }
        .item-status-indicator.partially-watched-indicator { color: #17a2b8; background-color: #d1ecf1; border: 1px solid #17a2b8; font-style: italic; }
        .carousel-container { position: relative; margin-bottom: 30px; }
        .carousel-track { display: flex; overflow-x: auto; scroll-behavior: smooth; padding: 10px 5px; gap: 15px; }
        .carousel-track .item-card { flex-shrink: 0; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .carousel-nav-btn { position: absolute; top: 50%; transform: translateY(-50%); background-color: rgba(0,0,0,0.4); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 20px; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; transition: background-color 0.2s ease; opacity: 0.7; }
        .carousel-nav-btn:hover { background-color: rgba(0,0,0,0.7); opacity: 1;}
        .carousel-nav-btn.prev { left: -10px; }
        .carousel-nav-btn.next { right: -10px; }
        .empty-state-message { text-align: center; font-size: 1.1em; color: var(--text-muted); padding: 40px 0; }
        .import-section { background-color: white; padding: 20px; border-radius: var(--border-radius); box-shadow: var(--card-shadow); margin-bottom: 30px; }
        .file-input { padding: 8px; border: 1px solid var(--medium-gray); border-radius: 6px; font-size: 0.9em; }
        .file-input:disabled { background-color: #e9ecef; cursor: not-allowed; }
        .import-status-message { margin-top: 10px; font-size: 0.9em; color: var(--text-muted); }
        .spinner { border: 4px solid rgba(0,0,0,0.1); width: 24px; height: 24px; border-radius: 50%; border-left-color: var(--primary-color); animation: spin 1s ease infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .manage-data-section { background-color: white; padding: 20px; border-radius: var(--border-radius); box-shadow: var(--card-shadow); margin-top: 30px; margin-bottom: 30px; text-align: center; }
        .clear-data-btn { padding: 10px 20px; background-color: var(--danger-color); color: white; border: none; border-radius: var(--border-radius); cursor: pointer; font-weight: 500; font-size: 1em; transition: background-color 0.2s ease; }
        .clear-data-btn:hover { background-color: #c82333; }
        .detail-modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.75); display: flex; justify-content: center; align-items: flex-start; z-index: 1000; overflow-y: auto; padding-top: 5vh; padding-bottom: 5vh; box-sizing: border-box; }
        .detail-modal-content { background-color: white; padding: 25px; border-radius: var(--border-radius); box-shadow: 0 5px 15px rgba(0,0,0,0.3); width: 90%; max-width: 800px; position: relative; margin: auto; }
        .modal-error-content {text-align: center; padding: 40px 20px;}
        .detail-modal-close { position: absolute; top: 10px; right: 15px; background: none; border: none; font-size: 2.2rem; cursor: pointer; color: #aaa; line-height: 1; padding: 0; }
        .detail-modal-close:hover { color: #333; }
        .detail-modal-header { display: flex; flex-direction: column; gap: 15px; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--medium-gray); }
        @media (min-width: 600px) { .detail-modal-header { flex-direction: row; gap: 25px; } }
        .detail-modal-poster { width: 150px; height: auto; max-height: 225px; object-fit: cover; border-radius: var(--border-radius); flex-shrink: 0; margin: 0 auto; }
        @media (min-width: 600px) { .detail-modal-poster { width: 200px; max-height: 300px; margin: 0; } }
        .detail-modal-title-section { flex-grow: 1; }
        .detail-modal-title-section h1 { margin-top: 0; font-size: 1.8em; color: var(--primary-color); margin-bottom: 8px; }
        @media (min-width: 600px) { .detail-modal-title-section h1 { font-size: 2.2em; } }
        .detail-modal-title-section p { margin: 4px 0; font-size: 0.9em; }
        .detail-modal-title-section p strong { color: var(--dark-gray); }
        .detail-modal-title-section .status-text { font-weight: bold; margin-top: 8px; font-size: 0.95em;}
        .detail-action-btn { padding: 8px 12px; margin-top: 10px; margin-right: 10px; border-radius: var(--border-radius); border: 1px solid var(--secondary-color); background-color: transparent; cursor: pointer; font-weight: 500; transition: background-color 0.2s ease, color 0.2s ease; }
        .detail-action-btn:hover { background-color: var(--secondary-color); color: white; }
        .detail-modal-body h2 { font-size: 1.4em; color: var(--dark-gray); margin-top: 25px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--medium-gray); }
        .seasons-section details { margin-bottom: 12px; border: 1px solid var(--medium-gray); border-radius: 4px; }
        .seasons-section summary { font-weight: bold; cursor: pointer; padding: 10px; background-color: var(--light-gray); border-radius: 3px; display: flex; align-items: center; gap: 8px; position:relative; }
        .seasons-section summary:hover { background-color: var(--medium-gray); }
        .seasons-section details[open] summary { border-bottom: 1px solid var(--medium-gray); }
        .season-overview { font-style: italic; color: #555; margin: 8px 10px 12px 10px; font-size: 0.9em; padding-left: 5px; }
        .episode-list { list-style-type: none; padding: 0 10px 10px 10px; margin: 0; }
        .episode-list li { margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dotted var(--medium-gray); font-size: 0.9em; display: flex; align-items: flex-start; gap: 8px;}
        .episode-list li:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0;}
        .episode-list li strong { display: block; margin-bottom: 3px; }
        .episode-list li p { font-size: 0.9em; color: #666; margin-top: 4px; margin-bottom: 0; padding-left: 0; }
        .spinner-modal { text-align: center; padding: 50px; font-size: 1.2em; display: flex; justify-content: center; align-items: center; min-height: 200px; }
        .watched-checkbox-label { display: flex; align-items: center; gap: 6px; font-weight: normal; cursor: pointer; user-select: none; margin: 5px 0; font-size: 0.9em; }
        .watched-checkbox-label input[type="checkbox"] { margin-right: 5px; cursor: pointer; width: 16px; height: 16px; flex-shrink:0; }
        .detail-modal-title-section .watched-checkbox-label {font-size: 1em; margin-top: 10px;}
        .episode-list .watched-checkbox-label { margin:0; }
        .episode-list li > div { flex-grow:1; }
      `}</style>

      <div className="app-container">
        <h1 className="app-header">My Movie & TV Tracker</h1>
        <div className="navigation-tabs">
          {['home', 'watchlist', 'history'].map(tab => (
            <button
              key={tab}
              onClick={() => { setView(tab); setResults([]); setQuery(''); setShowSuggestions(false); setIsDetailModalOpen(false); }}
              className={`nav-tab-btn ${view === tab ? 'active' : ''}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div ref={searchContainerRef} className="search-area">
          <input
            type="text" placeholder="Search TV shows and movies..." value={query}
            onChange={handleInputChange} onKeyDown={onKeyDown}
            onFocus={() => { if (query.trim() && suggestions.length > 0) setShowSuggestions(true); }}
            className="search-input" autoFocus
          />
          <button onClick={() => { setShowSuggestions(false); searchAll(); }} className="search-btn">Search</button>
          {showSuggestions && suggestions.length > 0 && (
            <ul className="suggestions-list" style={{width: searchContainerRef.current?.querySelector('.search-input')?.offsetWidth}}>
              {suggestions.map(suggestion => {
                const title = suggestion.media_type === 'movie' ? suggestion.title : suggestion.name;
                const year = suggestion.media_type === 'movie' ? (suggestion.release_date ? ` (${suggestion.release_date.substring(0,4)})` : '') : (suggestion.first_air_date ? ` (${suggestion.first_air_date.substring(0,4)})` : '');
                return (
                  <li key={`${suggestion.media_type}-${suggestion.id}`} onClick={() => handleSuggestionClick(suggestion)} className="suggestion-item">
                    {suggestion.poster_path ? <img src={`https://image.tmdb.org/t/p/w92${suggestion.poster_path}`} alt="" className="suggestion-poster"/> : <div className="suggestion-no-poster">N/A</div>}
                    <div className="suggestion-details">
                      <span className="suggestion-title">{title}</span>
                      <span className="suggestion-meta">{suggestion.media_type.toUpperCase()}{year}</span>
                    </div>
                  </li>);
              })}
            </ul>
          )}
        </div>
        {getContentToShow()}
      </div>
      {renderDetailModal()}
    </>
  );
}

export default App;