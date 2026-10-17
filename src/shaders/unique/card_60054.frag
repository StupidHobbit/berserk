#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

// Сейвар: borrowed life gathers in the snow beneath his open palm,
// while a discharge climbs the crystal staff and wakes the cyan runes.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.35,1.0,length((p-c)/r));
}
float line(vec2 p, vec2 a, vec2 b) {
    vec2 q=(p-a)*vec2(1.0,1.4113);
    vec2 v=(b-a)*vec2(1.0,1.4113);
    return length(q-v*clamp(dot(q,v)/max(dot(v,v),0.000001),0.0,1.0));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173);
    float art=smoothstep(0.142,0.151,p.y)*(1.0-smoothstep(0.550,0.558,p.y));
    art*=smoothstep(0.006,0.017,p.x)*(1.0-smoothstep(0.983,0.994,p.x));
    art*=smoothstep(1.0,1.12,length((p-vec2(0.111,0.182))/vec2(0.062,0.042)));
    vec3 color=scan.rgb;
    float luma=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float face=oval(p,vec2(0.679,0.242),vec2(0.064,0.065));
    float pulse=0.5+0.5*sin(t*1.65+seed*6.28318);
    float release=pow(0.5+0.5*sin(t*1.65+seed*6.28318-1.4),5.0);

    // Color-key the painted magical symbols inside the hood and robe.
    float hood=oval(p,vec2(0.686,0.256),vec2(0.216,0.123));
    float robe=oval(p,vec2(0.643,0.467),vec2(0.102,0.133));
    float runes=smoothstep(0.026,0.16,scan.b-scan.r)*smoothstep(0.23,0.55,scan.g);
    runes*=clamp(hood+robe,0.0,1.0)*(1.0-face);
    color+=vec3(0.028,0.23,0.29)*runes*(0.50+0.65*pulse);

    // A small cyan source in the existing snow rune sends souls into his palm.
    vec2 well=vec2(0.126,0.443);
    vec2 q=(p-well)*vec2(1.0,1.4113);
    float r=length(q);
    float fog=exp(-dot(q,q)/0.010);
    color+=vec3(0.015,0.09,0.14)*fog*(0.6+0.4*pulse);
    float circle=abs(length(q/vec2(1.0,0.43))-0.045);
    color+=vec3(0.06,0.40,0.45)*(1.0-smoothstep(0.0018,0.005+aa,circle))*(0.6+0.4*pulse);
    float souls=0.0;
    float halos=0.0;
    for (int i=0;i<9;i++) {
        float n=float(i);
        float age=fract(t*0.19+n/9.0+seed*0.21);
        float theta=n*2.39996+age*5.0;
        vec2 c=mix(well,vec2(0.315,0.421),age);
        c+=vec2(cos(theta)*0.068*(1.0-age),sin(theta)*0.030*(1.0-age));
        c.y-=sin(age*3.14159)*0.032;
        float d=length((p-c)*vec2(1.0,1.4113));
        float life=sin(age*3.14159);
        souls+=life*(1.0-smoothstep(0.0015,0.0045+aa,d));
        halos+=life*exp(-d*d/0.00022);
    }
    color+=vec3(0.28,0.67,0.65)*souls+vec3(0.02,0.10,0.15)*halos;
    float palm=oval(p,vec2(0.312,0.430),vec2(0.044,0.035));
    color+=vec3(0.035,0.16,0.20)*palm*(0.45+pulse);

    // The crystal's energy travels along the original twisted silver staff.
    float staff=0.0;
    float current=0.0;
    for (int i=0;i<24;i++) {
        float s=float(i)/24.0;
        float s1=(float(i)+1.0)/24.0;
        vec2 a=vec2(0.919+0.005*sin(s*36.0),mix(0.183,0.548,s));
        vec2 b=vec2(0.919+0.005*sin(s1*36.0),mix(0.183,0.548,s1));
        float d=line(p,a,b);
        float wave=pow(0.5+0.5*cos(s*22.0+t*3.2+seed*6.28),8.0);
        staff=max(staff,1.0-smoothstep(0.008,0.016,d));
        current=max(current,(1.0-smoothstep(0.0008,0.0025+aa,d))*(0.2+wave));
    }
    float grip=oval(p,vec2(0.924,0.278),vec2(0.037,0.039));
    color+=vec3(0.12,0.34,0.40)*current*(1.0-grip);
    float crystal=oval(p,vec2(0.918,0.157),vec2(0.038,0.055));
    color+=vec3(0.20,0.32,0.38)*crystal*(0.5+release);
    float ray=line(p,vec2(0.891,0.153),vec2(0.948,0.163));
    color+=vec3(0.16,0.28,0.35)*(1.0-smoothstep(0.001,0.003+aa,ray))*(0.2+release);

    if (u_is_foil) {
        // Broad ice-blue/prismatic reflections remain legible in a still image.
        float phase=p.x*1.85+p.y*2.8-t*0.11+seed*0.3;
        vec3 spectrum=0.5+0.5*cos(6.28318*(phase+vec3(0.0,0.333,0.667)));
        vec3 overlay=mix(2.0*color*spectrum,1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color=mix(color,overlay,0.32*(1.0-face*0.85));
        float silver=smoothstep(0.32,0.78,luma)*clamp(hood+robe+staff+crystal,0.0,1.0);
        float sheen=pow(0.5+0.5*sin(p.x*18.0+p.y*23.0-t*1.1),10.0);
        color+=(1.0-color)*mix(vec3(0.61,0.88,0.96),spectrum,0.5)*silver*(0.22+0.47*sheen)*(1.0-face);
        color+=(1.0-color)*spectrum*(0.05+0.10*sheen)*(1.0-face);
        color+=vec3(0.03,0.12,0.13)*runes;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
